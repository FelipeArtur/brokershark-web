import type { AccountSeed, MonthlyDelta } from "./accountBalances.ts";
import type { MonthlySnap } from "./positions.ts";

/**
 * @file    A posição no fim de UM mês, item a item.
 * @details `monthlyCheckingSeries` e `monthlyPortfolioSeries` respondem a série
 *          inteira, já somada. Aqui a pergunta é outra — "quanto tinha CADA conta e
 *          CADA posição no fim de março" — e é o que os widgets de contas e de
 *          investimentos precisam pra acompanhar o seletor de mês.
 * @warning Os dois cortes de encerramento são DIFERENTES de propósito, e é o mesmo
 *          par de regras das séries: ver `@warning` de cada função.
 */

/**
 * @brief   Saldo POR CONTA no fim de `ym`.
 * @warning Conta encerrada contribui 0 a partir do mês do encerramento, INCLUSIVE —
 *          o que se lê é saldo de fim de mês, e conta encerrada não tem nenhum.
 *          Espelha `monthlyCheckingSeries`; divergir faria o widget de contas e a
 *          série de patrimônio discordarem sobre o mesmo mês.
 */
export function checkingBalancesAt(
  accounts: AccountSeed[], deltas: MonthlyDelta[], ym: string,
): Map<string, number> {
  const saldo = new Map<string, number>(accounts.map(a => [a.id, a.initialCents]));
  //> O delta entra mesmo com a conta fechada; o corte é na leitura, como na série.
  for (const d of deltas) {
    if (d.ym <= ym) saldo.set(d.account_id, (saldo.get(d.account_id) ?? 0) + d.deltaCents);
  }
  const out = new Map<string, number>();
  for (const a of accounts) {
    out.set(a.id, a.closedYm && ym >= a.closedYm ? 0 : (saldo.get(a.id) ?? 0));
  }
  return out;
}

/**
 * @brief   Valor POR POSIÇÃO no fim de `ym`, por carry-forward do último snapshot.
 * @warning Corte em `ym > closed`, não `>=`: o snapshot do mês do fechamento é
 *          medição REAL, e descartá-lo apagaria o resgate do mês em que aconteceu.
 *          É de propósito diferente do corte de conta encerrada acima.
 * @note    `snaps` precisa vir ordenado por `ym` — é o último que vale.
 */
export function portfolioAt(
  snaps: MonthlySnap[], closedYm: Map<number, string>, ym: string,
): Map<number, number> {
  const ultimo = new Map<number, number>();
  for (const s of snaps) {
    if (s.ym <= ym) ultimo.set(s.investment_id, s.net_cents);
  }
  const out = new Map<number, number>();
  for (const [id, cents] of ultimo) {
    const fechada = closedYm.get(id);
    if (fechada && ym > fechada) continue;
    out.set(id, cents);
  }
  return out;
}
