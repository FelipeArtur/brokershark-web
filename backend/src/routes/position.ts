import type { DatabaseSync } from "node:sqlite";
import type { Req, Res } from "../http/respond.ts";
import { json, error, qsInt } from "../http/respond.ts";
import type { Route } from "../http/router.ts";
import { compilePath } from "../http/router.ts";
import { currentMonth } from "../domain/dates.ts";
import { prevRefMonth } from "../domain/dates.ts";
import { checkingBalancesAt, portfolioAt } from "../domain/positionAt.ts";

/**
 * @file    Quanto eu tinha no fim de um mês — conta a conta, posição a posição.
 * @details `/api/available`, `/api/accounts` e `/api/investments` respondem sempre
 *          por AGORA. Esta rota responde pelo mês pedido, com os mesmos cortes de
 *          encerramento das séries — é o que deixa os cartões e os widgets de
 *          posição acompanharem o seletor de mês sem cada um inventar a sua conta.
 * @warning Mês corrente devolve `is_current: true` e o cliente usa a posição VIVA
 *          (`/api/available`, que desconta o comprometido). Aqui não há comprometido:
 *          num mês fechado tudo que ia sair já saiu, e o saldo de fim de mês já reflete.
 */

const SQL_CONTAS = `
  SELECT id, bank, type, name, initial_balance_cents,
         strftime('%Y-%m', closed_at) AS closed_ym
  FROM accounts`;

const SQL_DELTAS = `
  SELECT t.account_id, strftime('%Y-%m', t.date) AS ym,
    SUM(CASE WHEN t.flow='income' THEN t.amount_cents ELSE -t.amount_cents END) AS delta_cents
  FROM transactions t
  GROUP BY t.account_id, ym
  ORDER BY ym`;

const SQL_SNAPS = `
  SELECT investment_id, ym, net_cents FROM (
    SELECT ps.investment_id, strftime('%Y-%m', ps.ref_date) AS ym, ps.net_cents,
      ROW_NUMBER() OVER (
        PARTITION BY ps.investment_id, strftime('%Y-%m', ps.ref_date)
        ORDER BY ps.ref_date DESC, ps.id DESC
      ) AS rn
    FROM position_snapshots ps
  ) WHERE rn = 1 ORDER BY ym`;

/** O mês teve lançamento? Sem isso não há como distinguir "nada se moveu" de
 *  "nada foi importado", e o painel afirma zero onde só há ausência. */
const SQL_TEM_DADO = `
  SELECT EXISTS(SELECT 1 FROM transactions WHERE strftime('%Y-%m', date) = ?) AS n`;

/** De QUANDO é esta posição: o último lançamento que entrou na conta dela. */
const SQL_ATE_QUANDO = `
  SELECT MAX(date) AS d FROM transactions WHERE strftime('%Y-%m', date) <= ?`;

const SQL_INVESTIMENTOS = `
  SELECT id, name, type, bank, group_name, source,
         strftime('%Y-%m', closed_at) AS closed_ym
  FROM investments`;

export function positionRoutes(db: DatabaseSync): Route[] {

  function getPosition(req: Req, res: Res) {
    const { month: cm, year: cy } = currentMonth();
    const month = qsInt(req, "month") ?? cm;
    const year = qsInt(req, "year") ?? cy;
    //> `Number.isInteger` também: `qsInt` aceita qualquer finito, e `month=3.7`
    //> passava a faixa e virava o mês "2026-3.7" numa fronteira que devia recusar.
    if (!Number.isInteger(month) || !Number.isInteger(year)
        || month < 1 || month > 12 || year < 1970 || year > 9999) {
      return error(res, "mês ou ano inválido");
    }
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    const contas = (db.prepare(SQL_CONTAS).all() as any[]);
    const seeds = contas.map(a => ({
      id: a.id as string,
      initialCents: a.initial_balance_cents as number,
      closedYm: (a.closed_ym as string | null) ?? null,
    }));
    const deltas = (db.prepare(SQL_DELTAS).all() as any[]).map(r => ({
      account_id: r.account_id as string,
      ym: r.ym as string,
      deltaCents: r.delta_cents as number,
    }));

    const invs = db.prepare(SQL_INVESTIMENTOS).all() as any[];
    const snaps = db.prepare(SQL_SNAPS).all() as any[];
    const fechadas = new Map<number, string>(
      invs.filter(i => i.closed_ym).map(i => [i.id as number, i.closed_ym as string]),
    );

    //> O mês anterior sai da MESMA função: calcular o Δ no cliente exigiria que ele
    //> reimplementasse carry-forward e os dois cortes de encerramento.
    const doMes = (alvo: string) => {
      const saldos = checkingBalancesAt(seeds, deltas, alvo);
      const carteira = portfolioAt(snaps, fechadas, alvo);
      let checking = 0;
      for (const a of contas) {
        if (a.type === "checking") checking += saldos.get(a.id) ?? 0;
      }
      let invested = 0;
      for (const cents of carteira.values()) invested += cents;
      return { saldos, carteira, checking, invested };
    };

    const atual = doMes(ym);
    const anterior = doMes(prevRefMonth(ym));

    const ymCorrente = `${cy}-${String(cm).padStart(2, "0")}`;
    const futuro = ym > ymCorrente;

    const temDado = (alvo: string) =>
      !!(db.prepare(SQL_TEM_DADO).get(alvo) as { n: number }).n;
    const anteriorYm = prevRefMonth(ym);
    const comDado = temDado(ym);
    const anteriorComDado = temDado(anteriorYm);

    //> O Δ só existe entre dois meses MEDIDOS. Com julho sem import, "+R$ 0,00 vs
    //> jul" diz que o patrimônio não mudou; o que houve é que ninguém olhou.
    const delta = (v: number) =>
      (futuro || !comDado || !anteriorComDado) ? null : v / 100;

    //> Futuro não tem saldo: `null`, nunca zero — zero é medição, e repetir o de
    //> hoje afirmaria quanto você vai ter em dezembro.
    const cents = (v: number) => (futuro ? null : v / 100);

    json(res, {
      ym,
      is_current: ym === ymCorrente,
      is_future: futuro,
      has_data: comDado,
      prev_has_data: anteriorComDado,
      //> A data do último lançamento que compõe a posição: sem ela o cliente não sabe
      //> que o saldo é de 22/06, e "Disponível Agora" vira afirmação sem lastro.
      as_of: (db.prepare(SQL_ATE_QUANDO).get(ym) as { d: string | null }).d,
      checking_total: cents(atual.checking),
      invested_total: cents(atual.invested),
      net_worth: cents(atual.checking + atual.invested),
      delta_net_worth: delta(atual.checking + atual.invested - anterior.checking - anterior.invested),
      delta_invested: delta(atual.invested - anterior.invested),
      credit_cards: contas.filter(a => a.type === "credit_card" && (!a.closed_ym || a.closed_ym >= ym)).map(a => {
        const invoice = db.prepare(`SELECT i.total_cents, i.due_date, t.date AS payment_date
          FROM invoices i LEFT JOIN transactions t ON t.id = i.payment_tx_id
          WHERE i.account_id = ? AND i.ref_month = ?`).get(a.id, ym) as any;
        return {
          id: a.id, bank: a.bank, type: a.type, name: a.name,
          open_invoice: invoice ? {total: invoice.total_cents / 100, ref_month: ym} : null,
          _invoice_paid: !!invoice?.payment_date,
          _invoice_payment_date: invoice?.payment_date ?? null,
          _invoice_due_date: invoice?.due_date ?? null,
        };
      }),
      accounts: contas.filter(a => a.type !== "credit_card").map(a => ({
        id: a.id, bank: a.bank, type: a.type, name: a.name,
        closed_at: a.closed_ym ?? null,
        balance: cents(atual.saldos.get(a.id) ?? 0),
      })),
      //> Posição sem valor no mês pedido não entra: ou é anterior ao primeiro
      //> snapshot, ou já estava fechada. Listá-la zerada inventaria uma linha.
      investments: futuro ? [] : invs
        .filter(i => atual.carteira.has(i.id))
        .map(i => ({
          id: i.id, name: i.name, type: i.type, bank: i.bank,
          group_name: i.group_name, derived: i.source === "ledger" ? 1 : 0,
          balance: (atual.carteira.get(i.id) ?? 0) / 100,
        }))
        .sort((a, b) => b.balance - a.balance),
    });
  }

  return [{ method: "GET", ...compilePath("/api/position"), handler: getPosition }];
}
