const { test } = require("node:test");
const assert = require("node:assert");
const B = require("./bulk.js");

const g = (k, sug) => ({ merchant_key: k, flow: "expense", ids: [1, 2],
                         suggested_category_id: sug });

test("suggestionPlan só devolve grupos COM sugestão", () => {
  const plano = B.suggestionPlan([g("a", 7), g("b", null), g("c", 9)]);
  assert.deepEqual(plano.map(p => p.merchant_key), ["a", "c"]);
});

test("suggestionPlan carrega ids e category_id de cada grupo", () => {
  const [p] = B.suggestionPlan([g("a", 7)]);
  assert.deepEqual(p, { merchant_key: "a", flow: "expense", ids: [1, 2], category_id: 7 });
});

test("suggestionPlan devolve vazio quando ninguém tem sugestão", () => {
  assert.deepEqual(B.suggestionPlan([g("a", null)]), []);
});

test("suggestionPlan aguenta lista vazia e undefined", () => {
  assert.deepEqual(B.suggestionPlan([]), []);
  assert.deepEqual(B.suggestionPlan(undefined), []);
});

test("suggestionPlan trata id 0 como sugestão ausente só se for null/undefined", () => {
  assert.equal(B.suggestionPlan([g("a", 0)]).length, 1);
});

test("groupsByFlow separa grupos de gastos e entradas", () => {
  const grupos = [
    { merchant_key: "mercado", flow: "expense", count: 2 },
    { merchant_key: "salario", flow: "income", count: 1 },
    { merchant_key: "farmacia", flow: "expense", count: 3 },
  ];
  const { expense, income } = B.groupsByFlow(grupos);
  assert.equal(expense.length, 2);
  assert.equal(income.length, 1);
  assert.deepEqual(expense.map(x => x.merchant_key), ["mercado", "farmacia"]);
  assert.deepEqual(income.map(x => x.merchant_key), ["salario"]);
});

test("groupsByFlow lida com lista vazia ou nula", () => {
  assert.deepEqual(B.groupsByFlow([]), { expense: [], income: [] });
  assert.deepEqual(B.groupsByFlow(null), { expense: [], income: [] });
});
