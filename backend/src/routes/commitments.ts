import type { DatabaseSync } from "node:sqlite";
import type { Req, Res } from "../http/respond.ts";
import { json, qsInt } from "../http/respond.ts";
import type { Route } from "../http/router.ts";
import { compilePath } from "../http/router.ts";
import { currentMonth, monthRange } from "../domain/dates.ts";
import { comprometidoDoMesCents, faturasDoMes, parcelasDoMes, recorrentesDoMes } from "../db/committed.ts";

/**
 * @file    O comprometido do mês — e SÓ o que o ledger sabe de verdade.
 * @details PARCELA: o banco escreveu "2 de 3", é contrato — e contrato vale pros meses
 *          que faltam, mesmo antes de a fatura deles existir. RECORRENTE: você apontou
 *          um lançamento, é declaração. Nada é deduzido do histórico.
 */

export function commitmentRoutes(db: DatabaseSync): Route[] {

  function getCommitments(req: Req, res: Res) {
    const { month: cm, year: cy } = currentMonth();
    const month = qsInt(req, "month") ?? cm;
    const year = qsInt(req, "year") ?? cy;
    const { start, end } = monthRange(month, year);
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    //> A lista e o total saem da MESMA leitura: passar `recorrentes` e `parcelas`
    //> adiante impede que o número e a lista que o explica venham de consultas diferentes.
    const recorrentes = recorrentesDoMes(db, ym, start, end);
    const parcelas = parcelasDoMes(db, ym);
    const cmt = comprometidoDoMesCents(db, ym, start, end, recorrentes, parcelas);

    const installments = parcelas.map(p => ({
      transaction_id: p.transaction_id,
      date: p.date,
      label: p.label,
      amount: p.amountCents / 100,
      flow: p.flow,
      seq: p.seq,
      total: p.total,
      remaining: p.remaining,
      projected: p.projected,
    }));

    const jaContado = new Set(installments.map(i => i.transaction_id));
    const recurring = recorrentes.map(r => ({
      transaction_id: r.transaction_id,
      label: r.label,
      flow: r.flow,
      bank: r.bank,
      confirmed: r.confirmed,
      date: r.date,
      day: r.day,
      amount: r.amountCents / 100,
      since: r.since,
      until: r.until,
      ended: r.ended,
      historic: r.historic,
      duplicate_of_installment: r.realId != null && jaContado.has(r.realId),
    }));

    json(res, {
      month: ym,
      //> A fatura é o maior pedaço do total e precisa de linha: sem ela o painel
      //> mostrava "nenhuma parcela nem recorrente" e cobrava o valor dela no rodapé.
      invoices: faturasDoMes(db, ym).map(f => ({
        invoice_id: f.invoice_id,
        account_id: f.account_id,
        account_name: f.account_name,
        ref_month: f.ref_month,
        due_date: f.due_date,
        amount: f.amountCents / 100,
      })),
      installments,
      recurring,
      total_out: cmt.totalCents / 100,
      total_invoices: cmt.faturasCents / 100,
      total_recurring: cmt.recorrentesCents / 100,
      total_installments: cmt.parcelasCents / 100,
    });
  }

  return [{ method: "GET", ...compilePath("/api/commitments"), handler: getCommitments }];
}
