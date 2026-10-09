import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "./open.ts";
import { runMigrations } from "./migrate.ts";
import { seedAccounts } from "../jobs/backfill/seeds.ts";
import { rebuildForecasts } from "./forecast.ts";
import { useTestConfig } from "../testing/fixtures.ts";

useTestConfig();

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  initSchema(db);
  runMigrations(db);
  seedAccounts(db);
  return db;
}

function parcela(
  db: DatabaseSync, date: string, cents: number, seq: number, total: number,
  desc = "Loja Aurora", categoryId: number | null = null,
): number {
  return Number(db.prepare(`INSERT INTO transactions
    (date, flow, method, account_id, amount_cents, description, category_id,
     installment_seq, installment_total)
    VALUES (?, 'expense', 'credit', 'cartao-b', ?, ?, ?, ?, ?)`)
    .run(date, cents, desc, categoryId, seq, total).lastInsertRowid);
}

const previstos = (db: DatabaseSync) =>
  db.prepare("SELECT * FROM forecast_transactions ORDER BY ref_month").all() as any[];

test("1 de 2 em maio gera a prevista de junho", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2);
  rebuildForecasts(db);

  const f = previstos(db);
  assert.equal(f.length, 1);
  assert.equal(f[0].ref_month, "2026-06");
  assert.equal(f[0].date, "2026-06-09", "mantém o dia da parcela de origem");
  assert.equal(f[0].installment_seq, 2);
  assert.equal(f[0].amount_cents, 5000);
  assert.equal(f[0].account_id, "cartao-b");
});

test("quando a parcela real chega, a prevista some — não se cobra duas vezes", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2);
  rebuildForecasts(db);
  assert.equal(previstos(db).length, 1);

  //> É o que o import da fatura de junho faz: a corrente avança, junho vira real.
  parcela(db, "2026-06-09", 5000, 2, 2);
  rebuildForecasts(db);

  assert.equal(previstos(db).length, 0, "junho agora é lançamento, não previsão");
});

test("reconstruir duas vezes seguidas não duplica nem muda nada", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 3);
  rebuildForecasts(db);
  const antes = previstos(db);
  rebuildForecasts(db);
  assert.deepEqual(previstos(db), antes);
});

test("a prevista herda a categoria da parcela de origem", () => {
  const db = freshDb();
  const cat = Number(db.prepare("INSERT INTO categories (name, flow) VALUES ('Farmácia','expense')")
    .run().lastInsertRowid);
  parcela(db, "2026-05-09", 5000, 1, 2, "Loja Aurora", cat);
  rebuildForecasts(db);
  assert.equal(previstos(db)[0].category_id, cat);
});

test("apagar a parcela de origem leva as previstas junto", () => {
  const db = freshDb();
  const id = parcela(db, "2026-05-09", 5000, 1, 3);
  rebuildForecasts(db);
  assert.equal(previstos(db).length, 2);

  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  assert.equal(previstos(db).length, 0, "sem CASCADE sobrariam previstas órfãs somando sozinhas");
});

test("dia 31 não escorrega pro mês seguinte", () => {
  const db = freshDb();
  parcela(db, "2026-01-31", 5000, 1, 2);
  rebuildForecasts(db);
  assert.equal(previstos(db)[0].date, "2026-02-28", "fevereiro não tem 31");
});

test("previsto NÃO entra em transactions — nenhum total do passado o enxerga", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2);
  rebuildForecasts(db);
  const n = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
  assert.equal(n.n, 1, "só a parcela real; a prevista mora na tabela dela");
});

// ── recorrência declarada ───────────────────────────────────────────────────

const proximoMes = (n: number) => {
  const d = new Date();
  const m = d.getMonth() + n;
  return `${d.getFullYear() + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};

function marcar(db: DatabaseSync, date: string, cents: number, desc: string,
                until: string | null = null, ended: string | null = null) {
  const id = Number(db.prepare(`INSERT INTO transactions
    (date, flow, method, account_id, amount_cents, description)
    VALUES (?, 'expense', 'pix', 'conta-a', ?, ?)`).run(date, cents, desc).lastInsertRowid);
  db.prepare("INSERT INTO recurring_marks (transaction_id, until_month, ended_at) VALUES (?, ?, ?)")
    .run(id, until, ended);
  return id;
}

const recorrentes = (db: DatabaseSync) =>
  db.prepare("SELECT * FROM forecast_transactions WHERE kind = 'recurring' ORDER BY ref_month").all() as any[];

test("recorrência sem prazo vira previsto até o horizonte", () => {
  const db = freshDb();
  marcar(db, "2020-01-10", 120000, "Aluguel");
  rebuildForecasts(db);

  const f = recorrentes(db);
  assert.equal(f.length, 12, "12 meses à frente, o mesmo alcance da navegação");
  assert.equal(f[0].ref_month, proximoMes(1), "começa no mês SEGUINTE ao corrente");
  assert.equal(f[0].installment_total, null, "sem prazo não tem 'de quantas'");
});

test("mês corrente e passado ficam de fora — lá quem responde é o lançamento", () => {
  const db = freshDb();
  marcar(db, "2020-01-10", 120000, "Aluguel");
  rebuildForecasts(db);
  const meses = recorrentes(db).map(r => r.ref_month);
  assert.ok(meses.every(m => m > proximoMes(0)), `vazou para o presente: ${meses[0]}`);
});

test("prazo corta a projeção e numera as ocorrências", () => {
  const db = freshDb();
  marcar(db, "2020-01-10", 50000, "Curso", proximoMes(3));
  rebuildForecasts(db);

  const f = recorrentes(db);
  assert.equal(f.length, 3, "meses +1, +2 e +3");
  assert.equal(f[2].ref_month, proximoMes(3));
  assert.ok(f[2].installment_total > 0, "com prazo, sabe de quantas é");
});

test("encerrada não projeta nada para frente", () => {
  const db = freshDb();
  marcar(db, "2020-01-10", 50000, "Curso", null, "2020-06-30");
  rebuildForecasts(db);
  assert.equal(recorrentes(db).length, 0);
});

test("desmarcar apaga as previstas na próxima reconstrução", () => {
  const db = freshDb();
  const id = marcar(db, "2020-01-10", 120000, "Aluguel");
  rebuildForecasts(db);
  assert.ok(recorrentes(db).length > 0);

  db.prepare("DELETE FROM recurring_marks WHERE transaction_id = ?").run(id);
  rebuildForecasts(db);
  assert.equal(recorrentes(db).length, 0);
});

test("parcela e recorrência convivem sem se misturar", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2);
  marcar(db, "2020-01-10", 120000, "Aluguel");
  rebuildForecasts(db);

  const todos = previstos(db);
  assert.equal(todos.filter(f => f.kind === "installment").length, 1);
  assert.equal(todos.filter(f => f.kind === "recurring").length, 12);
});
