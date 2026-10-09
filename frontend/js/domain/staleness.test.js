const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./staleness.js");

test("mês corrente com dado é em dia", () => {
  assert.equal(M.ledgerLag("2026-08-02", "2026-08-04").level, "ok");
});

test("último mês, começo do mês corrente: ainda não é atraso", () => {
  //> Dia 3 de agosto com dado até 28/07 é o intervalo NORMAL entre dois extratos.
  //> Cobrar aqui acusaria todo mundo, todo mês, e o aviso viraria ruído.
  assert.equal(M.ledgerLag("2026-07-28", "2026-08-03").level, "ok");
});

test("último mês, mês corrente já andado: cobra", () => {
  const r = M.ledgerLag("2026-07-28", "2026-08-15");
  assert.equal(r.level, "due");
  assert.equal(r.label, "Faltam dados do mês passado");
});

test("dois meses ou mais: atrasado, e diz quantos", () => {
  const r = M.ledgerLag("2026-06-22", "2026-08-04");
  assert.equal(r.level, "late");
  assert.equal(r.months, 2);
  assert.equal(r.label, "Faltam dados dos últimos 2 meses");
});

test("conta MESES de calendário, não dias", () => {
  //> 2 dias de diferença, mas o mês virou: 31/07 → 01/08 não é atraso nenhum.
  assert.equal(M.ledgerLag("2026-07-31", "2026-08-02").level, "ok");
  //> 32 dias de diferença e ainda é o mesmo salto de mês.
  assert.equal(M.ledgerLag("2026-07-01", "2026-08-02").level, "ok");
});

test("vira o ano sem se perder", () => {
  assert.equal(M.ledgerLag("2025-12-20", "2026-02-04").months, 2);
});

test("ledger vazio tem estado próprio, não 'atrasado'", () => {
  assert.equal(M.ledgerLag(null, "2026-08-04").level, "empty");
});

test("todayISO usa o fuso LOCAL, não UTC", () => {
  //> 23h de 4 de agosto em UTC-3 é 02h de 5 em UTC. `toISOString()` diria dia 5,
  //> e o aviso trocaria de estado sozinho ao anoitecer.
  const d = new Date(2026, 7, 4, 23, 30);
  assert.equal(M.todayISO(d), "2026-08-04");
});
