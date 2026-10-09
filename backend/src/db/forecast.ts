import type { DatabaseSync } from "node:sqlite";
import { addMonths, currentMonth } from "../domain/dates.ts";

/**
 * @file    Lançamento PREVISTO: a parcela que o contrato promete e a fatura ainda não trouxe.
 * @details "1 de 2" numa fatura de maio é o banco afirmando que junho tem a segunda —
 *          contrato, do mesmo nível do que já foi lançado. Tudo aqui é derivado: a
 *          reconstrução é a íntegra da verdade, e o que ela não gera deixa de existir.
 */

/**
 * O mês de uma parcela é o mês em que ela SAI — o da fatura que a carrega, não o
 * da compra. A fatura repete a data original em toda parcela ("2 de 3" de uma
 * compra de janeiro chega datada de janeiro), então ler `t.date` a jogaria no mês
 * da compra e o mês em que ela se paga nunca a veria.
 */
const SQL_PARCELAS_REAIS = `
  SELECT t.id, t.date, t.description, t.display_name, t.amount_cents, t.flow,
         t.category_id, t.installment_seq AS seq, t.installment_total AS total,
         t.account_id,
         COALESCE(strftime('%Y-%m', i.due_date), i.ref_month, strftime('%Y-%m', t.date)) AS ym,
         COALESCE(strftime('%d', i.due_date), strftime('%d', t.date)) AS dia
  FROM transactions t
  LEFT JOIN invoices i ON i.id = t.invoice_id
  WHERE t.installment_total IS NOT NULL AND t.installment_seq IS NOT NULL`;

const SQL_MESES_COM_FATURA = `
  SELECT account_id, COALESCE(strftime('%Y-%m', due_date), ref_month) AS ym FROM invoices`;

/**
 * As recorrências DECLARADAS, com a vigência que a marca impõe. O mês inicial
 * sai do lançamento apontado; `until_month` é o plano e `ended_at` é o fato.
 */
const SQL_RECORRENTES = `
  SELECT t.id, t.date, t.description, t.display_name, t.amount_cents, t.flow,
         t.category_id, t.account_id, rm.until_month, rm.ended_at
  FROM recurring_marks rm
  JOIN transactions t ON t.id = rm.transaction_id`;

const HORIZONTE_MESES = 12;  //< casa com `navigableMonths`: além dele, linha que ninguém alcança.

const SQL_INSERT = `
  INSERT INTO forecast_transactions
    (kind, date, ref_month, account_id, amount_cents, description, flow, category_id,
     installment_seq, installment_total, source_tx_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_tx_id, kind, ref_month) DO UPDATE SET
    date = excluded.date, amount_cents = excluded.amount_cents,
    description = excluded.description, installment_seq = excluded.installment_seq`;

type Projecao = {
  kind: "installment" | "recurring";
  date: string; ym: string; accountId: string; amountCents: number; description: string;
  flow: string; categoryId: number | null;
  seq: number | null; total: number | null; sourceTxId: number;
};

/** @brief Dia do mês existente: 31 em fevereiro cairia no mês seguinte. */
function diaValido(ym: string, dia: number): string {
  const [y, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const ultimo = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/**
 * @brief   O que o contrato ainda promete, a partir da última parcela conhecida.
 * @warning Mês com fatura importada não recebe projeção: lá a parcela já é lançamento
 *          e quem responde pelo cartão é a fatura. Projetar por cima cobraria em dobro.
 */
function projecoes(db: DatabaseSync): Projecao[] {
  const rows = db.prepare(SQL_PARCELAS_REAIS).all() as any[];

  const comFatura = new Set(
    (db.prepare(SQL_MESES_COM_FATURA).all() as any[]).map(i => `${i.account_id}|${i.ym}`),
  );

  //> A última parcela conhecida de cada contrato é de onde a projeção parte: se um
  //> mês já tem linha da corrente, o `k` sai dali pra frente e não o alcança.
  const contratos = new Map<string, any>();
  for (const r of rows) {
    const chave = `${r.account_id}|${r.description}|${r.total}`;
    const anterior = contratos.get(chave);
    if (!anterior || r.ym > anterior.ym) contratos.set(chave, r);
  }

  const out: Projecao[] = [];
  for (const r of contratos.values()) {
    for (let k = 1; k <= r.total - r.seq; k++) {
      const ym = addMonths(r.ym, k);
      if (comFatura.has(`${r.account_id}|${ym}`)) continue;
      out.push({
        kind: "installment",
        date: diaValido(ym, Number(r.dia)),
        ym,
        accountId: r.account_id,
        amountCents: r.amount_cents,
        description: r.display_name ?? r.description,
        flow: r.flow,
        categoryId: r.category_id ?? null,
        seq: r.seq + k,
        total: r.total,
        sourceTxId: r.id,
      });
    }
  }
  return out;
}

/**
 * @brief   As recorrências declaradas, projetadas nos meses que ainda não vieram.
 * @details Só do mês SEGUINTE ao corrente em diante: no passado e no mês corrente
 *          quem responde é o lançamento real, e uma previsão ao lado dele seria a
 *          mesma conta duas vezes na planilha.
 * @warning A vigência é a mesma de `recorrentesDoMes` — `until_month` (plano) e
 *          `ended_at` (fato), o que vier antes. Divergir faria o card e a planilha
 *          discordarem sobre até quando a conta ainda vem.
 */
function recorrencias(db: DatabaseSync): Projecao[] {
  const { month, year } = currentMonth();
  const corrente = `${year}-${String(month).padStart(2, "0")}`;

  const out: Projecao[] = [];
  for (const r of db.prepare(SQL_RECORRENTES).all() as any[]) {
    const desde = String(r.date).slice(0, 7);
    const fim = [r.until_month, r.ended_at ? String(r.ended_at).slice(0, 7) : null]
      .filter(Boolean).sort()[0] ?? null;

    for (let k = 1; k <= HORIZONTE_MESES; k++) {
      const ym = addMonths(corrente, k);
      if (ym < desde) continue;
      if (fim && ym > fim) break;
      out.push({
        kind: "recurring",
        date: diaValido(ym, Number(String(r.date).slice(8, 10))),
        ym,
        accountId: r.account_id,
        amountCents: r.amount_cents,
        description: r.display_name ?? r.description,
        flow: r.flow,
        categoryId: r.category_id ?? null,
        //> Sem prazo não há "de quantas": `null` diz isso, `0` seria um total falso.
        seq: fim ? monthSpan(desde, ym) : null,
        total: fim ? monthSpan(desde, fim) : null,
        sourceTxId: r.id,
      });
    }
  }
  return out;
}

/** Meses de `de` até `ate`, contando os dois. */
const monthSpan = (de: string, ate: string) =>
  (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12
  + (Number(ate.slice(5, 7)) - Number(de.slice(5, 7))) + 1;

/**
 * @brief   Refaz a tabela de previstos por inteiro. Idempotente.
 * @details É este recálculo que impede a cobrança dupla: chegando a fatura de junho,
 *          a corrente avança, junho deixa de ser projetado e a linha prevista some.
 *          Chame depois de qualquer coisa que mexa em parcela — import, undo, delete.
 * @returns Quantos previstos ficaram de pé.
 */
export function rebuildForecasts(db: DatabaseSync): number {
  const alvo = [...projecoes(db), ...recorrencias(db)];

  db.exec("BEGIN");
  try {
    //> Apaga o que deixou de ser previsto ANTES de gravar: a fatura que chegou tira
    //> a linha daquele mês, e é isso que faz o dinheiro não ser contado duas vezes.
    const vivos = new Set(alvo.map(p => `${p.sourceTxId}|${p.kind}|${p.ym}`));
    for (const r of db.prepare("SELECT id, source_tx_id, kind, ref_month FROM forecast_transactions").all() as any[]) {
      if (!vivos.has(`${r.source_tx_id}|${r.kind}|${r.ref_month}`)) {
        db.prepare("DELETE FROM forecast_transactions WHERE id = ?").run(r.id);
      }
    }

    const ins = db.prepare(SQL_INSERT);
    for (const p of alvo) {
      ins.run(p.kind, p.date, p.ym, p.accountId, p.amountCents, p.description, p.flow,
              p.categoryId, p.seq, p.total, p.sourceTxId);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return alvo.length;
}
