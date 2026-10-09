import type { DatabaseSync } from "node:sqlite";
import type { Req, Res } from "../http/respond.ts";
import { json, error, readBody, qsInt } from "../http/respond.ts";
import type { Route } from "../http/router.ts";
import { compilePath } from "../http/router.ts";
import { broadcast } from "../http/sse.ts";
import { rebuildForecasts } from "../db/forecast.ts";
import { isIntId, isIntIdArray, isShortText, isIsoDate } from "../http/validate.ts";
import { currentMonth, monthRange } from "../domain/dates.ts";
import { normalizeMerchant } from "../domain/merchant.ts";

// Aprende uma regra nome→categoria quando o usuário categoriza um lançamento.
// Upsert por matcher; nunca auto-aplica (só grava a regra que a sugestão vai ler).
export function learnCategoryRule(db: DatabaseSync, description: string, categoryId: number): void {
  const matcher = normalizeMerchant(description);
  if (!matcher || categoryId == null) return;
  const existing = db.prepare("SELECT id FROM rules WHERE action='category' AND matcher=?").get(matcher) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE rules SET value=?, enabled=1 WHERE id=?").run(String(categoryId), existing.id);
  } else {
    db.prepare("INSERT INTO rules (matcher, action, value, priority, enabled) VALUES (?, 'category', ?, 50, 1)")
      .run(matcher, String(categoryId));
  }
}

// O banco da conta viaja junto do lançamento: a tela rotula e colore por banco,
// e sem esse campo o chip cai no id cru ("conta-a"). Antes o frontend adivinhava
// pelo prefixo do id, o que só funcionava para as contas do autor.
const TX_SELECT = `
  SELECT t.*, c.name AS category_name, a.bank AS bank,
         (rm.transaction_id IS NOT NULL) AS is_recurring, rm.until_month AS recurring_until,
         rm.ended_at AS recurring_end
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN recurring_marks rm ON rm.transaction_id = t.id
`;

function txToJson(r: any): Record<string, unknown> {
  return {
    id: r.id,
    date: r.date,
    flow: r.flow,
    method: r.method,
    account_id: r.account_id,
    bank: r.bank ?? null,
    amount: r.amount_cents / 100,
    description: r.description,
    category_id: r.category_id,
    category_name: r.category_name ?? null,
    category: r.category_name ?? null,
    dest_account_id: r.dest_account_id,
    counterpart: r.counterpart,
    is_revenue: r.is_revenue,
    is_settlement: r.is_settlement,
    is_third_party: r.is_third_party,
    is_recurring: r.is_recurring ?? 0,
    recurring_until: r.recurring_until ?? null,
    recurring_end: r.recurring_end ?? null,
    external_id: r.external_id,
    display_name: r.display_name,
    original_amount: r.original_amount_cents != null ? r.original_amount_cents / 100 : null,
    import_batch_id: r.import_batch_id,
    investment_id: r.investment_id,
    invoice_id: r.invoice_id,
    installment_seq: r.installment_seq,
    installment_total: r.installment_total,
    bank_category: r.bank_category,
    self_pair_tx_id: r.self_pair_tx_id,
    source_file: r.source_file,
  };
}

export function transactionRoutes(db: DatabaseSync): Route[] {

  const categoryExists = (id: unknown): boolean =>
    isIntId(id) && db.prepare("SELECT 1 FROM categories WHERE id = ?").get(id) !== undefined;

  /**
   * @brief   A categoria serve pro fluxo destes lançamentos?
   * @warning Categoria tem `flow`, e o widget agrega por ele. Receita numa categoria
   *          de despesa entra no total de gasto daquela categoria e some do de receita:
   *          os dois números passam a discordar sem nada ficar vermelho.
   */
  function categoryFlowMismatch(categoryId: number, txIds: number[]): string | null {
    const cat = db.prepare("SELECT flow FROM categories WHERE id = ?").get(categoryId) as { flow: string };
    const ph = txIds.map(() => "?").join(",");
    const conflita = db.prepare(
      `SELECT COUNT(*) AS n FROM transactions WHERE id IN (${ph}) AND flow != ?`,
    ).get(...txIds, cat.flow) as { n: number };
    if (!conflita.n) return null;
    const oQue = cat.flow === "expense" ? "despesa" : "receita";
    return `a categoria é de ${oQue}, e ${conflita.n === 1 ? "o lançamento não é" : `${conflita.n} lançamentos não são`}`;
  }

  function getMonthTransactions(req: Req, res: Res) {
    const { month: cm, year: cy } = currentMonth();
    const month = qsInt(req, "month") ?? cm;
    const year = qsInt(req, "year") ?? cy;
    const { start, end } = monthRange(month, year);

    const rows = db.prepare(`${TX_SELECT} WHERE t.date >= ? AND t.date <= ? ORDER BY t.date DESC, t.id DESC`)
      .all(start, end) as any[];

    //> Previsto entra marcado, nunca disfarçado de lançamento: id com prefixo (PATCH
    //> nele daria 404) e `is_forecast`, que o põe numa espécie fora de todo total.
    const previstos = (db.prepare(`
      SELECT f.id, f.kind, f.date, f.account_id, f.amount_cents, f.description, f.flow,
             f.category_id, f.installment_seq, f.installment_total,
             c.name AS category_name, a.bank
      FROM forecast_transactions f
      LEFT JOIN categories c ON c.id = f.category_id
      LEFT JOIN accounts a ON a.id = f.account_id
      WHERE f.date >= ? AND f.date <= ? ORDER BY f.date DESC
    `).all(start, end) as any[]).map(r => ({
      id: `f${r.id}`,
      forecast_id: r.id,
      is_forecast: 1,
      forecast_kind: r.kind,
      date: r.date,
      flow: r.flow,
      method: r.kind === "recurring" ? "pix" : "credit",
      account_id: r.account_id,
      bank: r.bank ?? null,
      amount: r.amount_cents / 100,
      description: r.description,
      category_id: r.category_id,
      category_name: r.category_name ?? null,
      category: r.category_name ?? null,
      is_revenue: r.flow === "income" ? 1 : 0,
      is_settlement: 0,
      is_third_party: 0,
      is_recurring: 0,
      recurring_until: null,
      recurring_end: null,
      installment_seq: r.installment_seq,
      installment_total: r.installment_total,
    }));

    const rules = db.prepare(
      "SELECT matcher, value FROM rules WHERE action='category' AND enabled=1 ORDER BY priority ASC, id ASC"
    ).all() as any[];
    const catName = new Map<number, string>(
      (db.prepare("SELECT id, name FROM categories").all() as any[]).map(c => [c.id, c.name]),
    );

    const lancados = rows.map(r => {
      const obj = txToJson(r);
      if (r.category_id == null) {
        const hay = `${r.display_name ?? ""} ${r.description ?? ""}`.toLowerCase();
        const rule = rules.find(x => hay.includes(String(x.matcher).toLowerCase()));
        if (rule) {
          const sugId = Number(rule.value);
          obj.suggested_category_id = sugId;
          obj.suggested_category_name = catName.get(sugId) ?? null;
        }
      }
      return obj;
    });

    json(res, [...previstos, ...lancados]);
  }

  async function patchTransaction(req: Req, res: Res) {
    const id = Number(req.params!.id);
    if (!isIntId(id)) return error(res, "id inválido");
    const body = await readBody(req);

    const updates: string[] = [];
    const params: unknown[] = [];
    if ("category_id" in body) {
      const v = (body as any).category_id;
      if (v !== null && !categoryExists(v)) return error(res, "categoria inexistente");
      if (v !== null) {
        const erro = categoryFlowMismatch(v as number, [id]);
        if (erro) return error(res, erro);
      }
      updates.push("category_id = ?"); params.push(v);
    }
    if ("display_name" in body) {
      const v = (body as any).display_name;
      if (v !== null && !isShortText(v)) return error(res, "display_name inválido");
      updates.push("display_name = ?"); params.push(v);
    }
    if ("is_third_party" in body) {
      const v = (body as any).is_third_party;
      if (v !== 0 && v !== 1) return error(res, "is_third_party deve ser 0|1");
      updates.push("is_third_party = ?"); params.push(v);
    }

    //> Mora noutra tabela: sai do UPDATE, e vir sozinho no corpo é o caso comum.
    const marcaRecorrente = "recurring" in body;
    const ate = (body as any).recurring_until;
    const fim = (body as any).recurring_end;
    if (marcaRecorrente) {
      const v = (body as any).recurring;
      if (v !== 0 && v !== 1) return error(res, "recurring deve ser 0|1");
      const tx = db.prepare("SELECT date FROM transactions WHERE id = ?").get(id) as { date: string } | undefined;
      if (!tx) return error(res, "transação não encontrada", 404);

      if (ate != null) {
        if (typeof ate !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ate)) {
          return error(res, "recurring_until deve ser 'YYYY-MM' ou null");
        }
        //> Prazo antes do próprio lançamento deixaria a marca sem um único mês
        //> válido: gravada, invisível, e sem nada na tela explicando o sumiço.
        if (ate < tx.date.slice(0, 7)) {
          return error(res, "o prazo não pode ser anterior ao mês do lançamento");
        }
      }

      if (fim != null) {
        if (typeof fim !== "string" || !isIsoDate(fim)) {
          return error(res, "recurring_end deve ser 'YYYY-MM-DD' ou null");
        }
        //> Encerrar antes do próprio lançamento não descreve nada que aconteceu: a
        //> recorrência teria terminado antes da primeira vez em que caiu.
        if (fim < tx.date) {
          return error(res, "o encerramento não pode ser anterior ao lançamento");
        }
      }
    }
    if (!updates.length && !marcaRecorrente) return error(res, "nenhum campo para atualizar");

    if (marcaRecorrente) {
      if ((body as any).recurring === 1) {
        //> UPSERT e não INSERT OR IGNORE: remarcar com outro prazo tem que gravar o
        //> prazo novo, e o IGNORE deixava a marca antiga intacta em silêncio.
        db.prepare(`INSERT INTO recurring_marks (transaction_id, until_month, ended_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(transaction_id) DO UPDATE SET
                      until_month = excluded.until_month, ended_at = excluded.ended_at`)
          .run(id, ate ?? null, fim ?? null);
      } else {
        db.prepare("DELETE FROM recurring_marks WHERE transaction_id = ?").run(id);
      }
    }

    if (updates.length) {
      params.push(id);
      const r = db.prepare(`UPDATE transactions SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      if (r.changes === 0) return error(res, "transação não encontrada", 404);
    }
    if ("category_id" in body && (body as any).category_id != null) {
      const row = db.prepare("SELECT display_name, description FROM transactions WHERE id = ?").get(id) as any;
      if (row) learnCategoryRule(db, row.display_name ?? row.description, Number((body as any).category_id));
    }
    //> Marcar, mudar o prazo ou encerrar muda o que o contrato promete daqui pra
    //> frente. Sem refazer, o card mostrava a recorrência e a planilha não.
    if (marcaRecorrente) rebuildForecasts(db);
    broadcast();
    json(res, { ok: true });
  }

  async function deleteTransaction(req: Req, res: Res) {
    const id = Number(req.params!.id);
    if (!isIntId(id)) return error(res, "id inválido");

    const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as any;
    if (!tx) return error(res, "transação não encontrada", 404);

    const deleted: any[] = [tx];
    if (tx.self_pair_tx_id) {
      const pair = db.prepare("SELECT * FROM transactions WHERE id = ?").get(tx.self_pair_tx_id) as any;
      if (pair) deleted.push(pair);
    }
    for (const d of deleted) db.prepare("DELETE FROM transactions WHERE id = ?").run(d.id);

    //> Apagar uma parcela real muda o que o contrato ainda promete: o CASCADE tira
    //> as previstas dela, e a reconstrução reprojeta a partir da anterior.
    rebuildForecasts(db);
    broadcast();
    json(res, { ok: true, deleted: deleted.length, restore: deleted });
  }

  /**
   * @brief   Desfaz uma exclusão, recolocando as linhas como estavam.
   * @warning Tudo numa transação só. Sem ela, uma linha inválida no meio do lote
   *          deixava as anteriores gravadas e o undo virava restauração PARCIAL —
   *          pior que não ter desfeito, porque a tela diz que desfez.
   */
  async function restoreTransactions(req: Req, res: Res) {
    const body = await readBody<{ restore: any[] }>(req);
    if (!Array.isArray(body.restore) || !body.restore.length) return error(res, "nada para restaurar");

    const cols = [
      "id", "date", "flow", "method", "account_id", "amount_cents", "description",
      "category_id", "dest_account_id", "counterpart", "is_revenue", "is_settlement",
      "is_third_party", "external_id", "display_name", "original_amount_cents",
      "import_batch_id", "investment_id", "invoice_id", "installment_seq",
      "installment_total", "bank_category", "self_pair_tx_id", "source_file",
    ];
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO transactions (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    );

    db.prepare("BEGIN").run();
    try {
      for (const tx of body.restore) stmt.run(...cols.map(c => tx[c] ?? null));
      db.prepare("COMMIT").run();
    } catch (e) {
      db.prepare("ROLLBACK").run();
      return error(res, e instanceof Error ? e.message : "falha ao restaurar", 500);
    }
    rebuildForecasts(db);
    broadcast();
    json(res, { ok: true, restored: body.restore.length });
  }

  async function categorizeBulk(req: Req, res: Res) {
    const body = await readBody<{ ids: unknown; category_id: unknown }>(req);
    if (!isIntIdArray(body.ids)) return error(res, "ids inválidos");
    if (!categoryExists(body.category_id)) return error(res, "categoria inexistente");
    const erro = categoryFlowMismatch(body.category_id as number, body.ids);
    if (erro) return error(res, erro);

    const placeholders = body.ids.map(() => "?").join(",");
    db.prepare(`UPDATE transactions SET category_id = ? WHERE id IN (${placeholders})`)
      .run(body.category_id as number, ...body.ids);
    const rows = db.prepare(`SELECT display_name, description FROM transactions WHERE id IN (${placeholders})`)
      .all(...body.ids) as any[];
    for (const row of rows) learnCategoryRule(db, row.display_name ?? row.description, Number(body.category_id));
    broadcast();
    json(res, { ok: true, updated: body.ids.length });
  }

  const cp = compilePath;
  return [
    { method: "GET", ...cp("/api/month-transactions"), handler: getMonthTransactions },
    { method: "PATCH", ...cp("/api/transactions/:id"), handler: patchTransaction },
    { method: "DELETE", ...cp("/api/transactions/:id"), handler: deleteTransaction },
    { method: "POST", ...cp("/api/transactions/categorize-bulk"), handler: categorizeBulk },
    { method: "POST", ...cp("/api/transactions/restore"), handler: restoreTransactions },
  ];
}
