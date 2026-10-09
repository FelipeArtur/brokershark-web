import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { NODE_TEST_CONTEXT: _testContext, ...serverEnv } = process.env;

test("servidor recusa ledger externo sem alterar o arquivo", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-server-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "external.db");
  writeFileSync(path, "AUDIT_EXTERNAL_LEDGER");
  const child = spawn(process.execPath, [join(import.meta.dirname, "server.ts"), path], {
    env: { ...serverEnv, PORT: "0" }, stdio: "pipe",
  });
  let errors = "";
  child.stderr.on("data", (data) => { errors += data; });
  const [code] = await once(child, "close");
  assert.equal(code, 1);
  assert.match(errors, /vitrine|demonstração/i);
  assert.equal(readFileSync(path, "utf8"), "AUDIT_EXTERNAL_LEDGER");
});

test("vitrine bloqueia escrita e não consulta backups pessoais", { timeout: 15000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-server-test-"));
  writeFileSync(join(dir, "brokershark-2026-01-01.db"), "AUDIT_BACKUP_FILE");
  const child = spawn(process.execPath, [join(import.meta.dirname, "server.ts")], {
    env: { ...serverEnv, PORT: "0", BROKERSHARK_BACKUP_DIR: dir }, stdio: "pipe",
  });
  const exited = once(child, "close");
  t.after(async () => {
    child.kill();
    await exited;
    rmSync(dir, { recursive: true, force: true });
  });
  const base = await new Promise<string>((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on("error", reject);
    child.on("exit", () => reject(new Error("servidor encerrou antes de iniciar")));
  });
  const status = await fetch(base + "/api/backup-status").then((r) => r.json());
  assert.equal(status.demo, true);
  assert.equal(status.exists, false);
  assert.equal(status.name, undefined);
  const response = await fetch(base + "/api/import/preview", { method: "POST", body: "AUDIT_INPUT" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /demonstração|fictícios/i);
  const accounts = await fetch(base + "/api/accounts").then((r) => r.json());
  assert.ok(JSON.stringify(accounts).includes("Banco A"));
  assert.ok(!JSON.stringify(accounts).includes("AUDIT_INPUT"));
});
