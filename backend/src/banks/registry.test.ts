import { test } from "node:test";
import assert from "node:assert/strict";
import { banks, bankById } from "./registry.ts";
import { specFor } from "./types.ts";
import { formatById, statementParser } from "../ingest/registry.ts";

test("todo adaptador declara um formato que EXISTE", () => {
  //> Um adaptador apontando pra formato inexistente só falharia no import, com o
  //> arquivo já na mão. Aqui falha no teste.
  for (const b of banks()) {
    for (const t of ["checking", "credit_card"] as const) {
      const spec = specFor(b, t);
      if (!spec) continue;
      assert.ok(formatById(spec.format), `${b.id}.${t}: formato '${spec.format}' não existe`);
    }
  }
});

test("conta corrente de banco conhecido lê EXTRATO, não fatura", () => {
  //> Trocar os dois no adaptador faria o import tentar ler extrato com o parser de
  //> fatura, e o erro apareceria como "arquivo inválido" na cara de quem importou.
  for (const b of banks()) {
    if (b.checking) {
      assert.equal(formatById(b.checking.format)?.kind, "statement", `${b.id}.checking`);
      assert.doesNotThrow(() => statementParser(b.checking!.format));
    }
    if (b.credit_card) {
      assert.equal(formatById(b.credit_card.format)?.kind, "invoice", `${b.id}.credit_card`);
    }
  }
});

test("id de banco é chave estável: minúsculo, sem espaço", () => {
  for (const b of banks()) {
    assert.match(b.id, /^[a-z0-9-]+$/, b.id);
    assert.ok(b.label.trim().length > 0, b.id);
  }
});

test("dois adaptadores não disputam o mesmo id", () => {
  const ids = banks().map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("lookup tolera o que o usuário digita", () => {
  assert.equal(bankById("inter")?.id, "inter");
  assert.equal(bankById(" Inter ")?.id, "inter", "espaço e caixa não deviam decidir");
  assert.equal(bankById("INTER")?.id, "inter");
});

test("banco sem adaptador não é erro, é ausência", () => {
  //> O registro é atalho, nunca porteiro: barrar o desconhecido transformaria
  //> "ainda não tem adaptador" em "não dá para usar".
  assert.equal(bankById("banco-que-nao-existe"), undefined);
  assert.equal(bankById(null), undefined);
  assert.equal(bankById(""), undefined);
});
