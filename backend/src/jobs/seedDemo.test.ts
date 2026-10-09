import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config, setConfig } from "../config.ts";
import { seedDemo } from "./seedDemo.ts";

test("demo ignora configuração externa e usa somente contas fictícias", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-demo-test-"));
  const previous = process.env.BROKERSHARK_CONFIG;
  t.after(() => {
    if (previous === undefined) delete process.env.BROKERSHARK_CONFIG;
    else process.env.BROKERSHARK_CONFIG = previous;
    setConfig(null);
    rmSync(dir, { recursive: true, force: true });
  });
  const external = JSON.parse(readFileSync(join(import.meta.dirname, "../../../config/default.json"), "utf8"));
  external.accounts[0].name = "AUDIT_SENTINEL_ACCOUNT";
  external.accounts[0].bank = "AUDIT_SENTINEL_BANK";
  const file = join(dir, "external.json");
  writeFileSync(file, JSON.stringify(external));
  process.env.BROKERSHARK_CONFIG = file;
  setConfig(null);
  const path = join(dir, "demo.db");
  seedDemo(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const account = db.prepare("SELECT name, bank FROM accounts WHERE id='conta-a'").get();
    assert.equal(account?.name, "Banco A Conta");
    assert.equal(account?.bank, "Banco A");
    assert.equal(config().accounts[0].bank, "Banco A");
  } finally {
    db.close();
  }
});

test("demo não sobrescreve um arquivo existente", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-demo-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "existing.db");
  writeFileSync(path, "AUDIT_EXISTING_FILE");
  assert.throws(() => seedDemo(path), /existente/);
  assert.equal(readFileSync(path, "utf8"), "AUDIT_EXISTING_FILE");
});
