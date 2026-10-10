const { test } = require("node:test");
const assert = require("node:assert");
const B = require("./bars.js");

const slot = (income, expenses, prev) => ({
  data: { income, expenses },
  prev: prev ? { income: prev[0], expenses: prev[1] } : null,
});

const keys = (specs) => specs.map(s => s.key);

test("cobertura incompleta não vira medição nem comparação", () => {
  const partial = { data: { income: 100, expenses: 20, has_data: false }, prev: { income: 80, expenses: 10, has_data: true } };
  assert.ok(B.barSpecs(partial, 100, true).every(s => !s.measured && s.height === 0 && s.markAt === null));
  const zero = { data: { income: 0, expenses: 0, has_data: true }, prev: partial.data };
  assert.ok(B.barSpecs(zero, 100, true).every(s => s.measured && s.height === 0 && s.markAt === null));
});

test("sem comparar são só as duas barras do mês", () => {
  assert.deepEqual(keys(B.barSpecs(slot(100, 50, [80, 40]), 100, false)), ["i", "e"]);
});

test("comparar não acrescenta barra: o mês anterior vira MARCA na própria barra", () => {
  //> Lado a lado eram 4 barras por mês, 48 na fileira, e comparar exigia medir a
  //> distância entre dois objetos de altura parecida.
  const specs = B.barSpecs(slot(100, 50, [80, 40]), 100, true);
  assert.deepEqual(keys(specs), ["i", "e"]);
  assert.ok(specs.every(s => s.markAt != null));
});

test("a marca fica na altura do mês ANTERIOR, a barra na do mês", () => {
  const specs = B.barSpecs(slot(100, 50, [80, 40]), 100, true);
  const byKey = Object.fromEntries(specs.map(s => [s.key, s]));
  assert.equal(byKey.i.height, B.scaleBar(100, 100));
  assert.equal(byKey.i.markAt, B.scaleBar(80, 100));
  assert.equal(byKey.e.height, B.scaleBar(50, 100));
  assert.equal(byKey.e.markAt, B.scaleBar(40, 100));
});

test("o delta diz a direção sem o olho medir", () => {
  const specs = B.barSpecs(slot(100, 50, [80, 70]), 100, true);
  const byKey = Object.fromEntries(specs.map(s => [s.key, s.delta]));
  assert.equal(byKey.i, 20, "recebeu 20 a mais");
  assert.equal(byKey.e, -20, "gastou 20 a menos");
});

test("sem marca quando falta medição em qualquer ponta", () => {
  //> Sobre uma barra sem dado a marca não compara nada; sobre um anterior ausente
  //> ela diria "era zero", que é uma afirmação.
  assert.equal(B.barSpecs(slot(100, 50, null), 100, true)[0].markAt, null);
  assert.equal(B.barSpecs({ data: null, prev: { income: 80, expenses: 40 } }, 100, true)[0].markAt, null);
});

test("comparar sem mês anterior não inventa fantasma", () => {
  assert.deepEqual(keys(B.barSpecs(slot(100, 50, null), 100, true)), ["i", "e"]);
});

test("mês sem dado desenha barras de altura zero, não some", () => {
  const specs = B.barSpecs({ data: null, prev: null }, 100, false);
  assert.deepEqual(keys(specs), ["i", "e"]);
  assert.deepEqual(specs.map(s => s.height), [0, 0]);
});

// ── zero medido ≠ mês sem medição ───────────────────────────────────────────
// A altura é 0 nos dois casos, então quem separa é `measured`. Sem ele a tela
// desenha o mesmo nada para "não entrou nada este mês" e para "não há dado
// deste mês" — duas afirmações diferentes, do jeito que alvo de categoria e
// rendimento de posição também nunca confundem null com zero.

test("mês sem medição não é medido em nenhum dos lados", () => {
  const specs = B.barSpecs({ data: null, prev: null }, 100, false);
  assert.deepEqual(specs.map(s => s.measured), [false, false]);
});

test("mês medido cujo lado deu zero continua medido", () => {
  //> Existe no ledger: mês com gasto e nenhuma entrada.
  const specs = B.barSpecs(slot(0, 14.09, null), 100, false);
  const receita = specs.find(s => s.key === "i");
  assert.equal(receita.height, 0, "nada entrou, então nada a desenhar como barra");
  assert.equal(receita.measured, true, "mas foi medido, e isso é um fato do mês");
  assert.equal(specs.find(s => s.key === "e").measured, true);
});

test("o outro lado também: mês com entrada e nenhuma saída", () => {
  const specs = B.barSpecs(slot(50, 0, null), 100, false);
  const despesa = specs.find(s => s.key === "e");
  assert.equal(despesa.height, 0);
  assert.equal(despesa.measured, true);
});

test("a marca só existe onde os dois meses foram medidos", () => {
  const specs = B.barSpecs(slot(100, 50, [80, 40]), 100, true);
  assert.ok(specs.every(s => s.measured && s.markAt != null));
});

// ── escala ──────────────────────────────────────────────────────────────────

test("zero não vira barra; valor positivo nunca fica invisível", () => {
  assert.equal(B.scaleBar(0, 1000), 0);
  assert.equal(B.scaleBar(1, 1_000_000), B.BAR_MIN_PX);
});

test("o maior valor da série ocupa a altura cheia", () => {
  assert.equal(B.scaleBar(500, 500), B.BAR_MAX_PX);
});

test("maxV zero não vira NaN nem Infinity", () => {
  //> Divisão por zero viraria barra de altura NaN, que o browser colapsa.
  const h = B.scaleBar(10, 0);
  assert.ok(Number.isFinite(h), `altura ${h} não é finita`);
  assert.equal(h, B.BAR_MIN_PX);
});

test("valor ausente ou lixo não quebra a escala", () => {
  for (const v of [null, undefined, NaN, "abc", -5]) {
    assert.equal(B.scaleBar(v, 100), 0, `${JSON.stringify(v)} deveria dar 0`);
  }
});

test("a marca do mês anterior não passa do teto da moldura", () => {
  //> maxV é a escala do ANO na tela; o mês anterior pode ser de dezembro do ano
  //> passado e valer o dobro. Sem o corte a marca saía do gráfico.
  const slot = { data: { income: 100, expenses: 100 }, prev: { income: 900, expenses: 10 } };
  const [rec] = B.barSpecs(slot, 100, true);
  assert.equal(rec.markAt, B.BAR_MAX_PX);
});
