import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const repo = resolve(process.argv[2] ?? resolve(import.meta.dirname, ".."));
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 64 * 1024 * 1024 });
const findings = new Set();
const rules = [
  ["perfil", /\buser\s+profile\b|perfil\s+(?:pessoal|do usu[aá]rio)|\b\d{2}[- ]year[- ]old\b/i],
  ["caminho pessoal", /\/(?:home|Users)\/[^/\s]+\//],
  ["documento pessoal", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
  ["telefone", /(?:\+55\s*)?\(\d{2}\)\s*9?\d{4}[- ]\d{4}/],
];
function check(content, source) {
  for (const [kind, pattern] of rules) {
    if (pattern.test(content)) findings.add(`${kind}: ${source}`);
  }
  for (const match of content.matchAll(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g)) {
    if (!match[0].endsWith("@users.noreply.github.com")) findings.add(`email privado: ${source}`);
  }
}

const objects = git("rev-list", "--objects", "--all").toString().trim().split("\n");
let blobs = 0;
for (const row of objects) {
  const space = row.indexOf(" ");
  if (space < 0) continue;
  const oid = row.slice(0, space);
  const path = row.slice(space + 1);
  if (git("cat-file", "-t", oid).toString().trim() !== "blob") continue;
  blobs++;
  if (/\.(?:db(?:-(?:wal|shm))?|sqlite3?|csv|xlsx|pdf|pem|key|skill)$/i.test(path)
      || /(?:^|\/)(?:local\.json|user\.json|\.env(?:\..*)?|CLAUDE\.md|GEMINI\.md)$/.test(path)
      || path.startsWith(".github/assets/")) {
    findings.add(`arquivo de dados ou captura sem origem certificada: ${path}`);
  }
  const data = git("cat-file", "blob", oid);
  if (data.subarray(0, 16).toString().startsWith("SQLite format 3")) findings.add(`ledger: ${path}`);
  if (!data.includes(0)) check(data.toString("utf8"), path);
}
check(git("log", "--all", "--format=%ae%n%ce%n%B").toString(), "metadados Git");
if (findings.size) {
  console.error(`Privacidade reprovada: ${findings.size} grupos de ocorrências.`);
  for (const finding of [...findings].slice(0, 20)) console.error(finding);
  process.exit(1);
}
console.log(`Privacidade verificada: ${blobs} blobs; nenhum padrão pessoal detectado.`);
