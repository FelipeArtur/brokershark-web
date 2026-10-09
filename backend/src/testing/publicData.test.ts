import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const { NODE_TEST_CONTEXT: _testContext, ...runnerEnv } = process.env;

test("verificação recusa dados pessoais mesmo depois de removidos da ponta", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-privacy-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...runnerEnv, GIT_AUTHOR_NAME: "Demo Test", GIT_COMMITTER_NAME: "Demo Test",
    GIT_AUTHOR_EMAIL: "demo@users.noreply.github.com", GIT_COMMITTER_EMAIL: "demo@users.noreply.github.com" };
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { env, stdio: "pipe" });
  git("init", "-b", "main");
  writeFileSync(join(dir, "note.md"), ["User", "profile"].join(" ") + ": AUDIT_SYNTHETIC_PROFILE\n");
  git("add", "note.md");
  git("commit", "-m", "test: fixture");
  writeFileSync(join(dir, "note.md"), "Only fictional data\n");
  git("add", "note.md");
  git("commit", "-m", "test: remove fixture");
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "../../../scripts/check-public-data.mjs"), dir], { encoding: "utf8", env: runnerEnv });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /perfil/);
  assert.ok(!(result.stdout + result.stderr).includes("AUDIT_SYNTHETIC_PROFILE"));
});

test("verificação aceita raiz fictícia com autoria noreply", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brokershark-privacy-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...runnerEnv, GIT_AUTHOR_NAME: "Demo Test", GIT_COMMITTER_NAME: "Demo Test",
    GIT_AUTHOR_EMAIL: "demo@users.noreply.github.com", GIT_COMMITTER_EMAIL: "demo@users.noreply.github.com" };
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { env, stdio: "pipe" });
  git("init", "-b", "main");
  writeFileSync(join(dir, "note.md"), "Only fictional data\n");
  git("add", "note.md");
  git("commit", "-m", "test: fictional root");
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "../../../scripts/check-public-data.mjs"), dir], { encoding: "utf8", env: runnerEnv });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
