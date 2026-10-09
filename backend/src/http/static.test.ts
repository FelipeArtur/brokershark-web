import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStatic } from "./static.ts";

function raiz(): string {
  const dir = mkdtempSync(join(tmpdir(), "bs-static-"));
  writeFileSync(join(dir, "index.html"), "<h1>oi</h1>");
  mkdirSync(join(dir, "js"));
  writeFileSync(join(dir, "js", "app.js"), "console.log(1)");
  return dir;
}

/** Só os cabeçalhos interessam aqui; o corpo vai por `pipe` e não é lido. */
function pedir(serve: ReturnType<typeof makeStatic>, path: string) {
  let status = 0;
  let headers: Record<string, string> = {};
  const res: any = {
    writeHead(s: number, h: Record<string, string>) { status = s; headers = h ?? {}; },
    setHeader() {}, end() {}, on() { return res; }, once() { return res; },
    emit() {}, write() { return true; },
  };
  serve(path, res);
  return { status, headers };
}

test("estático nunca é guardado pelo navegador", () => {
  //> `no-cache` autoriza guardar e sem `ETag` a revalidação não acontece em
  //> back/forward: o painel voltava com o JS da sessão anterior.
  const serve = makeStatic(raiz());
  for (const p of ["/", "/static/js/app.js"]) {
    assert.equal(pedir(serve, p).headers["Cache-Control"], "no-store", p);
  }
});

test("o tipo do arquivo vai junto — sem ele o navegador adivinha", () => {
  const serve = makeStatic(raiz());
  assert.match(pedir(serve, "/").headers["Content-Type"], /text\/html/);
  assert.match(pedir(serve, "/static/js/app.js").headers["Content-Type"], /text\/javascript/);
});

test("travessia pra fora da raiz é 404, não leitura de disco", () => {
  const serve = makeStatic(raiz());
  for (const p of ["/static/../../etc/passwd", "/static/js/../../../../etc/passwd"]) {
    assert.equal(pedir(serve, p).status, 404, p);
  }
});

test("fora do prefixo /static/ não serve nada", () => {
  const serve = makeStatic(raiz());
  assert.equal(pedir(serve, "/js/app.js").status, 404);
});
