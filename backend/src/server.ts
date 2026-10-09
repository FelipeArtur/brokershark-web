import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb, pickDbPath } from "./db/open.ts";
import { rebuildForecasts } from "./db/forecast.ts";
import type { Req, Res } from "./http/respond.ts";
import { error, json, HttpError } from "./http/respond.ts";
import type { Route } from "./http/router.ts";
import { dispatch } from "./http/router.ts";
import { handleSse } from "./http/sse.ts";
import { makeStatic } from "./http/static.ts";
import { hostAllowed, securityHeaders, originAllowed } from "./http/security.ts";
import { accountRoutes } from "./routes/accounts.ts";
import { transactionRoutes } from "./routes/transactions.ts";
import { categoryRoutes } from "./routes/categories.ts";
import { analyticsRoutes } from "./routes/analytics.ts";
import { investmentRoutes } from "./routes/investments.ts";
import { commitmentRoutes } from "./routes/commitments.ts";
import { positionRoutes } from "./routes/position.ts";
import { ruleRoutes } from "./routes/rules.ts";
import { seedDemo } from "./jobs/seedDemo.ts";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.PORT ?? 8000);
const serveStatic = makeStatic(resolve(import.meta.dirname, "../../frontend"));
if (pickDbPath(args)) {
  console.error("A vitrine aceita somente demonstração fictícia; ledger externo é recusado.");
  process.exit(1);
}
const demoDir = mkdtempSync(join(tmpdir(), "brokershark-demo-"));
const dbPath = join(demoDir, "demo.db");
seedDemo(dbPath);
const preparation = openDb(dbPath);
rebuildForecasts(preparation);
preparation.close();
const db = new DatabaseSync(dbPath, { readOnly: true });
process.once("exit", () => {
  db.close();
  rmSync(demoDir, { recursive: true, force: true });
});
process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

const routes: Route[] = [
  ...accountRoutes(db),
  ...transactionRoutes(db),
  ...categoryRoutes(db),
  ...analyticsRoutes(db),
  ...investmentRoutes(db),
  ...commitmentRoutes(db),
  ...positionRoutes(db),
  ...ruleRoutes(db),
].filter((route) => route.method === "GET");

// O que alimenta o HUD da barra superior: até onde os dados vão e quando foi o
// último snapshot. As duas respondem à mesma pergunta ("o ledger está em dia?"),
// então viajam juntas — o painel não precisa de duas idas ao servidor pra pintar
// dois chips de 10px.
function handleBackupStatus(_req: Req, res: Res): void {
  const last = db.prepare("SELECT MAX(date) AS d FROM transactions").get() as { d: string | null };
  json(res, { demo: true, exists: false, last_tx_date: last.d });
}

const server = createServer(async (req: Req, res: Res) => {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  const qIdx = url.indexOf("?");
  const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;

  try {
    if (!hostAllowed(req)) return error(res, "host não permitido", 403);
    securityHeaders(res);

    if (method !== "GET" && method !== "HEAD" && !originAllowed(req)) {
      return error(res, "origin não permitido", 403);
    }
    if (method !== "GET" && method !== "HEAD") {
      return error(res, "Demonstração com dados fictícios: alterações e importação indisponíveis.", 403);
    }

    if (method === "GET" && pathname === "/api/events") return handleSse(req, res);
    if (method === "GET" && pathname === "/api/backup-status") return handleBackupStatus(req, res);

    if (await dispatch(routes, req, res, pathname)) return;

    if (pathname.startsWith("/api/")) return error(res, "endpoint não implementado", 404);
    if (method === "GET") return serveStatic(pathname, res);
    error(res, "not found", 404);
  } catch (err) {
    if (err instanceof HttpError && !res.headersSent) return error(res, err.message, err.status);
    console.error(`${method} ${url} —`, err);
    if (!res.headersSent) error(res, "internal error", 500);
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const address = server.address();
  const port = address && typeof address !== "string" ? address.port : PORT;
  console.log(`BrokerShark — demonstração fictícia — http://127.0.0.1:${port}`);
});
