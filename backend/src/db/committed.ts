import type { DatabaseSync } from "node:sqlite";
import { normalizeMerchant } from "../domain/merchant.ts";

/**
 * @file    O que ainda vai SAIR da conta corrente neste mês-calendário.
 * @details Fonte única: o herói (`/api/available`) e o card (`/api/commitments`) leem
 *          daqui — a mesma lista, o mesmo total. Cada um com a sua consulta era o
 *          jeito garantido de o número grande e a lista que o explica divergirem.
 */

export type Recorrente = {
  transaction_id: number;
  label: string;
  flow: string;
  bank: string | null;
  /** Já caiu no mês? Existe lançamento com o mesmo núcleo de comerciante. */
  confirmed: boolean;
  /** Data REAL quando já caiu; `null` enquanto é previsão. */
  date: string | null;
  /** Dia declarado, do lançamento que originou a marca. */
  day: number;
  /** Último mês em que vale ('YYYY-MM'); `null` = sem prazo. */
  until: string | null;
  /** Data em que foi encerrada de fato; `null` = ativa. */
  ended: string | null;
  /** Aparece só porque JÁ CAIU neste mês — a vigência não a alcança mais. */
  historic: boolean;
  /** Valor real quando já caiu, declarado enquanto não. */
  amountCents: number;
  since: string;
  /** Id do lançamento real, pra quem precisa cruzar com as parcelas do mês. */
  realId: number | null;
};

const SQL_MARCAS = `
  SELECT t.id, t.date, t.description, t.display_name, t.amount_cents, t.flow, a.bank,
         rm.until_month, rm.ended_at
  FROM recurring_marks rm
  JOIN transactions t ON t.id = rm.transaction_id
  LEFT JOIN accounts a ON a.id = t.account_id
  ORDER BY t.amount_cents DESC`;

const SQL_TX_DO_MES = `
  SELECT id, date, description, display_name, amount_cents
  FROM transactions WHERE date >= ? AND date <= ? ORDER BY date`;

const SQL_FATURAS = `
  SELECT COALESCE(SUM(total_cents), 0) AS c FROM invoices
  WHERE payment_tx_id IS NULL AND due_date IS NOT NULL
    AND strftime('%Y-%m', due_date) = ?`;

/** As faturas que compõem `faturasCents` — a lista que explica o número. */
const SQL_FATURAS_LISTA = `
  SELECT i.id, i.account_id, i.ref_month, i.total_cents, i.due_date, a.name AS account_name
  FROM invoices i
  LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.payment_tx_id IS NULL AND i.due_date IS NOT NULL
    AND strftime('%Y-%m', i.due_date) = ?
  ORDER BY i.due_date`;

/**
 * O mês de uma parcela é o mês em que ela SAI — o da fatura que a carrega, não o
 * da compra. A fatura repete a data original em toda parcela ("2 de 3" de uma
 * compra de janeiro chega datada de janeiro), então filtrar por `t.date` jogava a
 * parcela no mês da compra e ela nunca aparecia no mês em que se paga.
 */
const SQL_PARCELAS = `
  SELECT t.id, t.date, t.description, t.display_name, t.amount_cents, t.flow,
         t.installment_seq AS seq, t.installment_total AS total
  FROM transactions t
  LEFT JOIN invoices i ON i.id = t.invoice_id
  WHERE t.installment_total IS NOT NULL
    AND COALESCE(strftime('%Y-%m', i.due_date), i.ref_month, strftime('%Y-%m', t.date)) = ?
  ORDER BY t.date`;

//> Só `installment`: quem responde pela recorrência é `recorrentesDoMes`, que sabe
//> se já caiu e usa o valor REAL — as duas aqui contariam a mesma conta duas vezes.
const SQL_PREVISTAS = `
  SELECT f.id, f.date, f.description, f.amount_cents, f.flow,
         f.installment_seq AS seq, f.installment_total AS total
  FROM forecast_transactions f
  WHERE f.ref_month = ? AND f.kind = 'installment' ORDER BY f.date`;

const rotulo = (r: { display_name?: string | null; description: string }) =>
  r.display_name ?? r.description;

export type FaturaAberta = {
  invoice_id: number;
  account_id: string;
  account_name: string | null;
  ref_month: string;
  due_date: string;
  amountCents: number;
};

/**
 * @brief   As faturas em aberto que vencem no mês.
 * @warning Elas são a maior parte do comprometido e não tinham linha: o card dizia
 *          "nenhuma parcela nem recorrente" enquanto o rodapé cobrava o valor delas.
 *          Um total sem a lista que o explica é o que esta tabela existe pra evitar.
 */
export function faturasDoMes(db: DatabaseSync, ym: string): FaturaAberta[] {
  return (db.prepare(SQL_FATURAS_LISTA).all(ym) as any[]).map(r => ({
    invoice_id: r.id,
    account_id: r.account_id,
    account_name: r.account_name ?? null,
    ref_month: r.ref_month,
    due_date: r.due_date,
    amountCents: r.total_cents,
  }));
}

export type Parcela = {
  /** Id do lançamento REAL; `null` na prevista (o id dela é `forecast_id`). */
  transaction_id: number | null;
  /** Id em `forecast_transactions`; `null` na já lançada. */
  forecast_id: number | null;
  date: string;
  label: string;
  flow: string;
  amountCents: number;
  seq: number | null;
  total: number;
  remaining: number;
  projected: boolean;
};

const toParcela = (r: any, projected: boolean): Parcela => ({
  transaction_id: projected ? null : r.id,
  forecast_id: projected ? r.id : null,
  date: r.date,
  label: rotulo(r),
  flow: r.flow,
  amountCents: r.amount_cents,
  seq: r.seq,
  total: r.total,
  remaining: Math.max(0, r.total - (r.seq ?? 0)),
  projected,
});

/**
 * @brief   As parcelas que saem no mês: as já lançadas mais as PREVISTAS do contrato.
 * @details Quem gera as previstas é `rebuildForecasts` (`db/forecast.ts`) — aqui só se
 *          lê. Ler é o que garante que a lista, o total e a planilha vejam a mesma coisa.
 */
export function parcelasDoMes(db: DatabaseSync, ym: string): Parcela[] {
  return [
    ...(db.prepare(SQL_PARCELAS).all(ym) as any[]).map(r => toParcela(r, false)),
    ...(db.prepare(SQL_PREVISTAS).all(ym) as any[]).map(r => toParcela(r, true)),
  ];
}

/**
 * @brief   As recorrências declaradas que valem para o mês, já resolvidas.
 * @details Não valem para trás: o mês anterior ao lançamento que originou a marca não
 *          a teve, e afirmar o contrário inventaria passado.
 */
export function recorrentesDoMes(
  db: DatabaseSync, ym: string, start: string, end: string,
): Recorrente[] {
  const doMes = new Map<string, any>();
  for (const t of db.prepare(SQL_TX_DO_MES).all(start, end) as any[]) {
    const chave = normalizeMerchant(rotulo(t));
    if (chave && !doMes.has(chave)) doMes.set(chave, t);
  }

  return (db.prepare(SQL_MARCAS).all() as any[])
    .filter(r => String(r.date).slice(0, 7) <= ym)
    .map(r => {
      const real = doMes.get(normalizeMerchant(rotulo(r)));
      //> Vigência: o plano (`until_month`) E o fato (`ended_at`), o que vier antes —
      //> sem isso um contrato de 12x enche o planejamento de meses que não existirão.
      const dentroDoPrazo = !r.until_month || ym <= r.until_month;
      const dentroDaVida = !r.ended_at || ym <= String(r.ended_at).slice(0, 7);
      const vigente = dentroDoPrazo && dentroDaVida;
      //> Fora da vigência mas JÁ CAIU no mês: a linha fica. Encerrar afeta o futuro,
      //> nunca reescreve o mês em que a conta realmente chegou.
      if (!vigente && !real) return null;
      return {
        transaction_id: r.id,
        label: rotulo(r),
        flow: r.flow,
        bank: r.bank ?? null,
        confirmed: !!real,
        date: real ? real.date : null,
        day: Number(String(r.date).slice(8, 10)),
        amountCents: real ? real.amount_cents : r.amount_cents,
        since: String(r.date).slice(0, 7),
        until: r.until_month ?? null,
        ended: r.ended_at ?? null,
        historic: !vigente,
        realId: real ? real.id : null,
      };
    })
    .filter((r): r is Recorrente => r !== null);
}

/**
 * @brief   Total comprometido do mês, em centavos.
 * @warning Parcela LANÇADA não entra em separado: ela é item de uma fatura, e somar as
 *          duas contaria o mesmo dinheiro duas vezes. Só a PROJETADA soma — ela existe
 *          justamente nos meses cuja fatura ainda não foi importada, onde nada mais a
 *          representa. Recorrência que já caiu também não entra: o saldo já a reflete.
 */
export function comprometidoDoMesCents(
  db: DatabaseSync, ym: string, start: string, end: string,
  recorrentes = recorrentesDoMes(db, ym, start, end),
  parcelas = parcelasDoMes(db, ym),
): { totalCents: number; faturasCents: number; recorrentesCents: number; parcelasCents: number } {
  const faturasCents = (db.prepare(SQL_FATURAS).get(ym) as { c: number }).c;
  const recorrentesCents = recorrentes
    //> `historic` fora do total: ela sobrevive na lista só como registro do mês em
    //> que caiu. Somá-la faria uma recorrência encerrada continuar comprometendo.
    .filter(r => r.flow === "expense" && !r.confirmed && !r.historic)
    .reduce((s, r) => s + r.amountCents, 0);
  const parcelasCents = parcelas
    .filter(p => p.projected && p.flow === "expense")
    .reduce((s, p) => s + p.amountCents, 0);
  return {
    totalCents: faturasCents + recorrentesCents + parcelasCents,
    faturasCents, recorrentesCents, parcelasCents,
  };
}
