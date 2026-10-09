import { test } from "node:test";
import assert from "node:assert/strict";
import { formats, formatById, detectFormat, statementParser, isStatementFormat } from "./registry.ts";

const CABECALHOS = {
  ids: "Data,Valor,Identificador,Descrição\n2026-01-02,10.00,abc,Padaria",
  "running-balance": "Extrato\n\nData Lançamento;Histórico;Valor;Saldo\n01/06/2026;Pix;10,00;100,00",
  itemized: "data,lançamento,categoria,tipo,valor\n01/05/2026,Loja,mercado,Compra,50.00",
};

test("cada formato reconhece o próprio cabeçalho", () => {
  for (const [id, csv] of Object.entries(CABECALHOS)) {
    assert.equal(detectFormat(csv), id, `não reconheceu ${id}`);
  }
});

test("nenhum formato reconhece o cabeçalho de outro", () => {
  //> Dois farejadores casando o mesmo arquivo fariam o parser escolhido depender
  //> da ordem da lista — o tipo de acaso que só aparece com o arquivo do usuário.
  for (const [id, csv] of Object.entries(CABECALHOS)) {
    const head = csv.slice(0, 4096).toLowerCase();
    const casaram = formats().filter(f => f.sniff(head)).map(f => f.id);
    assert.deepEqual(casaram, [id], `${id} casou com ${casaram.join(", ")}`);
  }
});

test("conteúdo desconhecido não é forçado num formato", () => {
  assert.equal(detectFormat("qualquer,coisa\n1,2"), null);
  assert.equal(detectFormat(""), null);
});

test("só o começo do arquivo entra na decisão", () => {
  //> Ler 20MB para farejar cabeçalho é trabalho jogado fora; a palavra-chave
  //> depois do limite não pode mudar a resposta.
  const lixo = "a,b\n".repeat(2000);
  assert.equal(detectFormat(lixo + "identificador,valor"), null);
});

test("formato de extrato tem parser; o de fatura não finge ter", () => {
  for (const f of formats()) {
    if (f.kind === "statement") {
      assert.equal(typeof statementParser(f.id), "function", f.id);
      assert.ok(isStatementFormat(f.id));
    } else {
      assert.throws(() => statementParser(f.id), /não lê extrato/, f.id);
      assert.ok(!isStatementFormat(f.id));
    }
  }
});

test("todo formato tem rótulo — a UI lista daqui", () => {
  for (const f of formats()) assert.ok(f.label.trim().length > 0, f.id);
});

test("id desconhecido devolve nada, não estoura", () => {
  assert.equal(formatById("inexistente"), undefined);
  assert.equal(formatById(null), undefined);
});
