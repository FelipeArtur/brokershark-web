import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatementFormat } from "./resolveFormat.ts";

const EXTRATO_IDS = "Data,Valor,Identificador,Descrição\n02/01/2026,10.00,abc,Padaria\n";
const EXTRATO_SALDO = "Data Lançamento;Histórico;Valor;Saldo\n01/06/2026;Pix;10,00;100,00\n";

test("a config manda: declarada, ela vence adaptador e conteúdo", () => {
  //> Quem declarou o formato à mão fez isso porque o palpite errava. Deixar o
  //> farejador ganhar desfaria a correção em silêncio, no arquivo seguinte.
  assert.equal(resolveStatementFormat({
    declared: "running-balance",
    bank: "nubank",          // o adaptador diria "ids"
    content: EXTRATO_IDS,    // o farejador diria "ids"
  }), "running-balance");
});

test("sem config, o adaptador do banco resolve", () => {
  //> É o caso da conta criada pela UI: a config não sabe dela.
  assert.equal(resolveStatementFormat({ bank: "nubank", accountType: "checking" }), "ids");
  assert.equal(resolveStatementFormat({ bank: "inter", accountType: "checking" }), "running-balance");
  assert.equal(resolveStatementFormat({ bank: "inter", accountType: "credit_card" }), "itemized");
});

test("o adaptador vence o conteúdo", () => {
  //> Um extrato do Nubank com cabeçalho ambíguo continua sendo lido como Nubank.
  assert.equal(resolveStatementFormat({ bank: "nubank", content: EXTRATO_SALDO }), "ids");
});

test("banco sem adaptador cai no farejador, não em erro", () => {
  assert.equal(resolveStatementFormat({ bank: "banco-qualquer", content: EXTRATO_IDS }), "ids");
  assert.equal(resolveStatementFormat({ bank: null, content: EXTRATO_SALDO }), "running-balance");
});

test("tipo de conta que o adaptador não oferece cai no farejador", () => {
  //> Nubank não declara cartão. Pedir cartão dele não pode devolver o formato da
  //> conta corrente, que leria a fatura com o parser errado.
  assert.equal(resolveStatementFormat({
    bank: "nubank", accountType: "credit_card", content: EXTRATO_IDS,
  }), "ids", "veio do conteúdo, não do adaptador");
  assert.equal(resolveStatementFormat({ bank: "nubank", accountType: "credit_card" }), null);
});

test("nada resolve devolve null — o import recusa em vez de adivinhar", () => {
  assert.equal(resolveStatementFormat({}), null);
  assert.equal(resolveStatementFormat({ bank: "desconhecido", content: "a,b\n1,2" }), null);
});

test("formato declarado que não existe é ignorado, não propagado", () => {
  //> Um typo em `config/local.json` não pode virar um formato fantasma que o
  //> `statementParser` recebe e não conhece.
  assert.equal(resolveStatementFormat({ declared: "formato-inventado", bank: "nubank" }), "ids");
});
