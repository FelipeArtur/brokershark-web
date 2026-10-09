import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { initSchema } from "../db/open.ts";
import { runMigrations } from "../db/migrate.ts";
import { seedAccounts } from "../jobs/backfill/seeds.ts";
import { positionRoutes } from "./position.ts";
import { dispatch } from "../http/router.ts";
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

async function pedir(db: DatabaseSync, url: string) {
  const req = Readable.from([]) as any;
  req.method = "GET"; req.url = url; req.headers = {};
  let status = 200; let payload: any;
  const res: any = {
    headersSent: false, setHeader() {},
    writeHead(s: number) { status = s; },
    end(s: string) { payload = s ? JSON.parse(s) : undefined; },
  };
  await dispatch(positionRoutes(db), req, res, url.split("?")[0]);
  return { status, payload };
}

test("mês ou ano fora da faixa é recusado", async () => {
  const db = freshDb();
  for (const qs of ["month=0", "month=13", "month=-1", "year=1969", "year=10000"]) {
    assert.equal((await pedir(db, `/api/position?${qs}`)).status, 400, qs);
  }
});

test("número quebrado é recusado — não vira o mês '2026-3.7'", async () => {
  const db = freshDb();
  for (const qs of ["month=3.7", "year=2026.5", "month=1e1"]) {
    const r = await pedir(db, `/api/position?${qs}`);
    if (qs === "month=1e1") continue; //> 1e1 é 10, inteiro e válido
    assert.equal(r.status, 400, qs);
  }
});

test("mês futuro não devolve saldo nenhum — nem zero, que seria medição", async () => {
  const db = freshDb();
  const { payload } = await pedir(db, "/api/position?year=2099&month=6");
  assert.equal(payload.is_future, true);
  assert.equal(payload.checking_total, null);
  assert.equal(payload.net_worth, null);
  assert.deepEqual(payload.investments, []);
  assert.ok(payload.accounts.every((a: any) => a.balance === null));
});

test("sem lançamento no mês, o Δ não existe — zero afirmaria que nada mudou", () => {
  const db = freshDb();
  //> Ledger vazio: nem o mês nem o anterior têm medição. "+R$ 0,00 vs jul" diria
  //> que o patrimônio ficou parado; o que houve é que ninguém importou nada.
  return pedir(db, "/api/position?year=2026&month=8").then(({ payload }) => {
    assert.equal(payload.has_data, false);
    assert.equal(payload.prev_has_data, false);
    assert.equal(payload.delta_net_worth, null);
    assert.equal(payload.delta_invested, null);
  });
});

test("com os dois meses medidos, o Δ aparece", async () => {
  const db = freshDb();
  const põe = (date: string, cents: number) => db.prepare(`INSERT INTO transactions
    (date, flow, method, account_id, amount_cents, description)
    VALUES (?, 'income', 'pix', 'conta-a', ?, 'Salário')`).run(date, cents);
  põe("2026-03-05", 100000);
  põe("2026-04-05", 150000);

  const { payload } = await pedir(db, "/api/position?year=2026&month=4");
  assert.equal(payload.has_data, true);
  assert.equal(payload.prev_has_data, true);
  assert.equal(payload.delta_net_worth, 1500, "só abril entrou depois de março");
});

test("as_of diz de quando é a posição, não de quando ela foi pedida", async () => {
  const db = freshDb();
  db.prepare(`INSERT INTO transactions (date, flow, method, account_id, amount_cents, description)
              VALUES ('2026-06-22','income','pix','conta-a',10000,'Salário')`).run();

  //> Pedir agosto devolve o saldo de junho: é o último que existe. Sem `as_of`,
  //> o cliente chamaria isso de "disponível agora" com 43 dias de atraso.
  const { payload } = await pedir(db, "/api/position?year=2026&month=8");
  assert.equal(payload.as_of, "2026-06-22");
  assert.equal(payload.has_data, false, "agosto em si não tem lançamento");
});
