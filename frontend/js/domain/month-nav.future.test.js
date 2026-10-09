const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./month-nav.js");

const mes = (year, month, income = 0, expenses = 0) =>
  ({ year, month, label: `${String(month).padStart(2, "0")}/${year}`, income, expenses });

test("meses com dado continuam lá, e o futuro entra depois", () => {
  const out = M.navigableMonths([mes(2026, 5), mes(2026, 6)], "2026-08-04", 3);
  assert.deepEqual(out.map(m => m.label),
    ["05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026", "11/2026"]);
});

test("o vão entre o último import e hoje fica alcançável", () => {
  //> Ledger para em junho, hoje é agosto: julho não tem dado e não é futuro, mas
  //> precisa ser navegável — é justamente o mês que falta importar.
  const out = M.navigableMonths([mes(2026, 6)], "2026-08-04", 1);
  const jul = out.find(m => m.label === "07/2026");
  assert.ok(jul, "julho sumia da régua: o loop começava no mês corrente");
  assert.equal(jul.future, false, "mês do vão é passado sem import, não planejamento");
  assert.equal(out.length, 4, "junho + julho + agosto + setembro");
});

test("vão de vários meses entra inteiro", () => {
  const out = M.navigableMonths([mes(2025, 11)], "2026-02-10", 0);
  assert.deepEqual(out.map(m => m.label), ["11/2025", "12/2025", "01/2026", "02/2026"]);
});

test("mês futuro é marcado, e não finge fluxo zerado", () => {
  const fut = M.navigableMonths([mes(2026, 6, 100, 50)], "2026-08-04", 1).find(m => m.label === "09/2026");
  assert.equal(fut.future, true);
  assert.equal(fut.income, undefined, "zero seria dado; ausência é ausência");
});

test("não duplica mês que já tem dado", () => {
  const out = M.navigableMonths([mes(2026, 8, 10, 5)], "2026-08-04", 1);
  assert.equal(out.filter(m => m.label === "08/2026").length, 1);
  assert.equal(out[0].income, 10, "o que tem dado vence o placeholder");
});

test("vira o ano", () => {
  const out = M.navigableMonths([], "2026-11-01", 3);
  assert.deepEqual(out.map(m => m.label), ["11/2026", "12/2026", "01/2027", "02/2027"]);
});

test("sem hoje, devolve o que veio — nunca inventa futuro do nada", () => {
  assert.deepEqual(M.navigableMonths([mes(2026, 6)], null), [mes(2026, 6)]);
});

test("monthSpan conta os dois extremos — 12 meses são 12 ocorrências, não 11", () => {
  assert.equal(M.monthSpan("2026-06", "2027-05"), 12);
  assert.equal(M.monthSpan("2026-06", "2026-06"), 1, "mês único é 1×");
  assert.equal(M.monthSpan("2025-11", "2026-02"), 4, "vira o ano");
  assert.equal(M.monthSpan("2026-06", null), 0, "sem prazo não conta nada");
});
