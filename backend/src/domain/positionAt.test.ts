import { test } from "node:test";
import assert from "node:assert/strict";
import { checkingBalancesAt, portfolioAt } from "./positionAt.ts";
import { monthlyCheckingSeries } from "./accountBalances.ts";
import { monthlyPortfolioSeries } from "./positions.ts";

const conta = (id: string, initialCents: number, closedYm: string | null = null) =>
  ({ id, initialCents, closedYm });
const delta = (account_id: string, ym: string, deltaCents: number) =>
  ({ account_id, ym, deltaCents });
const snap = (investment_id: number, ym: string, net_cents: number) =>
  ({ investment_id, ym, net_cents });

// ── saldo por conta ─────────────────────────────────────────────────────────

test("saldo é o inicial mais tudo que entrou ATÉ o fim do mês", () => {
  const contas = [conta("a", 10000)];
  const ds = [delta("a", "2026-01", 5000), delta("a", "2026-03", -2000)];

  assert.equal(checkingBalancesAt(contas, ds, "2026-01").get("a"), 15000);
  assert.equal(checkingBalancesAt(contas, ds, "2026-02").get("a"), 15000, "mês sem movimento carrega");
  assert.equal(checkingBalancesAt(contas, ds, "2026-03").get("a"), 13000);
});

test("mês anterior a qualquer movimento é o saldo inicial", () => {
  assert.equal(
    checkingBalancesAt([conta("a", 10000)], [delta("a", "2026-05", 500)], "2026-01").get("a"),
    10000,
  );
});

test("conta encerrada zera no MÊS do encerramento, inclusive", () => {
  //> Encerrar sem transferência de saída (saque em espécie) deixaria o saldo
  //> pendurado: o que se lê é FIM de mês, e conta encerrada não tem nenhum.
  const contas = [conta("a", 10000, "2026-03")];
  const ds = [delta("a", "2026-01", 5000)];

  assert.equal(checkingBalancesAt(contas, ds, "2026-02").get("a"), 15000);
  assert.equal(checkingBalancesAt(contas, ds, "2026-03").get("a"), 0, "no mês do encerramento já é 0");
  assert.equal(checkingBalancesAt(contas, ds, "2026-04").get("a"), 0);
});

test("soma das contas bate com a série mensal — divergir faria widget e gráfico brigarem", () => {
  const contas = [conta("a", 10000), conta("b", 2000, "2026-03")];
  const ds = [
    delta("a", "2026-01", 5000), delta("b", "2026-01", 700),
    delta("a", "2026-02", -1500), delta("b", "2026-02", 300),
    delta("a", "2026-03", 800),
  ];
  const serie = monthlyCheckingSeries(contas, ds);

  for (const p of serie) {
    const soma = [...checkingBalancesAt(contas, ds, p.ym).values()].reduce((s, c) => s + c, 0);
    assert.equal(soma, p.total_cents, `divergiu em ${p.ym}`);
  }
});

// ── carteira por posição ────────────────────────────────────────────────────

test("posição carrega o último snapshot pra frente", () => {
  const snaps = [snap(1, "2026-01", 50000), snap(1, "2026-03", 52000)];
  assert.equal(portfolioAt(snaps, new Map(), "2026-01").get(1), 50000);
  assert.equal(portfolioAt(snaps, new Map(), "2026-02").get(1), 50000, "sem snapshot, carrega");
  assert.equal(portfolioAt(snaps, new Map(), "2026-03").get(1), 52000);
});

test("mês anterior ao primeiro snapshot não tem a posição", () => {
  assert.equal(portfolioAt([snap(1, "2026-03", 50000)], new Map(), "2026-01").has(1), false);
});

test("posição fechada some DEPOIS do mês do fechamento, não nele", () => {
  //> Diferente de conta encerrada de propósito: o snapshot do mês do fechamento é
  //> medição real, e descartá-lo apagaria o resgate do mês em que aconteceu.
  const snaps = [snap(1, "2026-01", 50000), snap(1, "2026-02", 0)];
  const fechadas = new Map([[1, "2026-02"]]);

  assert.equal(portfolioAt(snaps, fechadas, "2026-02").get(1), 0, "no mês do fechamento ainda aparece");
  assert.equal(portfolioAt(snaps, fechadas, "2026-03").has(1), false);
});

test("soma da carteira bate com a série mensal", () => {
  const snaps = [
    snap(1, "2026-01", 50000), snap(2, "2026-01", 10000),
    snap(1, "2026-02", 51000),
    snap(2, "2026-03", 12000), snap(1, "2026-03", 52000),
  ];
  const fechadas = new Map([[2, "2026-03"]]);
  const serie = monthlyPortfolioSeries(snaps, fechadas);

  for (const p of serie) {
    const soma = [...portfolioAt(snaps, fechadas, p.ym).values()].reduce((s, c) => s + c, 0);
    assert.equal(soma, p.total_cents, `divergiu em ${p.ym}`);
  }
});
