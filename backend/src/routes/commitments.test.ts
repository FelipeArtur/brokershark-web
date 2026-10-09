import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../db/open.ts";
import { runMigrations } from "../db/migrate.ts";
import { seedAccounts } from "../jobs/backfill/seeds.ts";
import { commitmentRoutes } from "./commitments.ts";
import { rebuildForecasts } from "../db/forecast.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useTestConfig } from "../testing/fixtures.ts";

useTestConfig();

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "../db/migrations");

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  initSchema(db);
  runMigrations(db, MIGRATIONS_DIR);
  seedAccounts(db);
  return db;
}

/** O card é do MÊS: sem mês na query ele responde pelo corrente. */
function getCommitments(db: DatabaseSync, ym?: string): any {
  //> O server refaz os previstos no boot e a cada import; o teste faz o mesmo.
  rebuildForecasts(db);
  const route = commitmentRoutes(db).find(r => r.method === "GET")!;
  let payload: any;
  const res: any = { setHeader() {}, end(s: string) { payload = JSON.parse(s); }, writeHead() {} };
  const qs = ym ? `?year=${ym.slice(0, 4)}&month=${Number(ym.slice(5, 7))}` : "";
  route.handler({ url: `/api/commitments${qs}`, params: {} } as any, res);
  return payload;
}

function parcela(
  db: DatabaseSync, date: string, amountCents: number, seq: number, total: number, desc = "Steam",
): number {
  return Number(db.prepare(`INSERT INTO transactions
    (date, flow, method, account_id, amount_cents, description, installment_seq, installment_total, import_batch_id)
    VALUES (?, 'expense', 'credit', 'cartao-b', ?, ?, ?, ?, 'sess-1')`)
    .run(date, amountCents, desc, seq, total).lastInsertRowid);
}

function lancamento(
  db: DatabaseSync, date: string, amountCents: number, desc: string, flow = "expense",
): number {
  return Number(db.prepare(`INSERT INTO transactions
    (date, flow, method, account_id, amount_cents, description)
    VALUES (?, ?, 'pix', 'conta-a', ?, ?)`)
    .run(date, flow, amountCents, desc).lastInsertRowid);
}

const marcarRecorrente = (db: DatabaseSync, id: number, until: string | null = null) =>
  db.prepare("INSERT INTO recurring_marks (transaction_id, until_month) VALUES (?, ?)").run(id, until);

// ── parcelas ────────────────────────────────────────────────────────────────

test("parcela do mês aparece com a posição que o banco declarou", () => {
  const db = freshDb();
  parcela(db, "2026-04-11", 12000, 2, 3, "Oficina Norte");
  const out = getCommitments(db, "2026-04");

  assert.equal(out.installments.length, 1);
  const p = out.installments[0];
  assert.equal(p.amount, 120);
  assert.equal(p.seq, 2);
  assert.equal(p.total, 3);
  assert.equal(p.remaining, 1, "de 3, já caíram 2, falta 1");
});

test("parcela de mês anterior ao contrato não entra — nem pra trás, nem depois do fim", () => {
  const db = freshDb();
  parcela(db, "2026-04-11", 12000, 2, 3);
  assert.equal(getCommitments(db, "2026-03").installments.length, 0, "antes não existia");
  assert.equal(getCommitments(db, "2026-06").installments.length, 0, "3 de 3 foi em maio");
  assert.equal(getCommitments(db, "2026-04").installments.length, 1);
});

// ── o contrato vale pros meses que faltam ───────────────────────────────────

test("a parcela que falta aparece no mês seguinte, antes de a fatura existir", () => {
  const db = freshDb();
  //> O caso do relato: "1 de 2" numa fatura de maio. Junho tem a segunda por
  //> contrato do banco; sem projetar, ela sumia até a fatura de junho ser importada.
  parcela(db, "2026-05-09", 5000, 1, 2, "Loja Aurora");

  const p = getCommitments(db, "2026-06").installments;
  assert.equal(p.length, 1);
  assert.equal(p[0].seq, 2);
  assert.equal(p[0].total, 2);
  assert.equal(p[0].projected, true);
  assert.equal(p[0].transaction_id, null, "ainda não é lançamento nenhum");
  assert.equal(p[0].amount, 50);
  assert.equal(p[0].remaining, 0);
});

test("contrato longo projeta um por mês, e para no total", () => {
  const db = freshDb();
  parcela(db, "2026-11-10", 10000, 1, 3, "Steam");
  assert.equal(getCommitments(db, "2026-12").installments[0].seq, 2, "vira o ano");
  assert.equal(getCommitments(db, "2027-01").installments[0].seq, 3);
  assert.equal(getCommitments(db, "2027-02").installments.length, 0);
});

test("projetada soma no total — nenhuma fatura a representa naquele mês", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2, "Loja Aurora");
  const out = getCommitments(db, "2026-06");
  assert.equal(out.total_installments, 50);
  assert.equal(out.total_out, 50);
});

test("mês com fatura importada não recebe projeção — seria contar em dobro", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2, "Loja Aurora");
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file) VALUES ('cartao-b','2026-06','2026-06-10',9000,'ui')",
  ).run();

  const out = getCommitments(db, "2026-06");
  assert.equal(out.installments.length, 0, "quem responde por junho é a fatura de junho");
  assert.equal(out.total_out, 90, "só a fatura");
});

test("a parcela lançada não é projetada de novo no mesmo mês", () => {
  const db = freshDb();
  parcela(db, "2026-05-09", 5000, 1, 2, "Loja Aurora");
  parcela(db, "2026-06-09", 5000, 2, 2, "Loja Aurora");
  const out = getCommitments(db, "2026-06");
  assert.equal(out.installments.length, 1);
  assert.equal(out.installments[0].projected, false);
  assert.equal(out.total_out, 0, "lançada é item de fatura: aparece, não soma");
});

test("a parcela cai no mês da FATURA, não no da compra", () => {
  const db = freshDb();
  //> A fatura repete a data da compra em toda parcela: filtrar por `date` jogava a
  //> "2 de 3" em janeiro, e o mês em que ela realmente sai nunca a via.
  const inv = Number(db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file) VALUES ('cartao-b','2026-04','2026-04-10',6216,'ui')",
  ).run().lastInsertRowid);
  db.prepare("UPDATE transactions SET invoice_id = ? WHERE id = ?")
    .run(inv, parcela(db, "2026-01-26", 6000, 2, 3, "Casa e Construção"));

  assert.equal(getCommitments(db, "2026-01").installments.length, 0, "janeiro foi a compra");
  assert.equal(getCommitments(db, "2026-04").installments.length, 1, "abril é quando sai");
});

test("compra à vista não é parcela", () => {
  const db = freshDb();
  lancamento(db, "2026-04-10", 5000, "Padaria");
  assert.equal(getCommitments(db, "2026-04").installments.length, 0);
});

test("última parcela não deixa resto", () => {
  const db = freshDb();
  parcela(db, "2026-04-11", 12000, 3, 3);
  assert.equal(getCommitments(db, "2026-04").installments[0].remaining, 0);
});

// ── recorrência DECLARADA ───────────────────────────────────────────────────

test("nada é recorrente sem você declarar", () => {
  const db = freshDb();
  //> Três meses idênticos: o detector antigo chamaria de recorrência. Sem marca, não.
  for (const d of ["2026-02-10", "2026-03-10", "2026-04-10"]) lancamento(db, d, 120000, "Aluguel");
  assert.equal(getCommitments(db, "2026-05").recurring.length, 0);
});

test("declarada, repete nos meses seguintes com o dia e o valor do lançamento", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  const r = getCommitments(db, "2026-06").recurring;

  assert.equal(r.length, 1);
  assert.equal(r[0].amount, 1200);
  assert.equal(r[0].day, 10);
  assert.equal(r[0].confirmed, false, "junho não tem o lançamento, então é previsto");
  assert.equal(r[0].since, "2026-04");
});

test("não vale para trás: mês anterior ao lançamento não a teve", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  assert.equal(getCommitments(db, "2026-03").recurring.length, 0);
  assert.equal(getCommitments(db, "2026-04").recurring.length, 1);
});

test("mês em que já caiu usa o valor e a data reais, não os declarados", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  lancamento(db, "2026-05-12", 125000, "Aluguel");

  const r = getCommitments(db, "2026-05").recurring[0];
  assert.equal(r.confirmed, true);
  assert.equal(r.amount, 1250, "o reajuste real manda, não o valor da declaração");
  assert.equal(r.date, "2026-05-12");
});

test("desmarcar tira do card", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  assert.equal(getCommitments(db, "2026-06").recurring.length, 1);
  db.prepare("DELETE FROM recurring_marks WHERE transaction_id = ?").run(id);
  assert.equal(getCommitments(db, "2026-06").recurring.length, 0);
});

test("apagar o lançamento leva a marca junto", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  assert.equal(
    (db.prepare("SELECT COUNT(*) n FROM recurring_marks").get() as any).n, 0,
    "sem CASCADE a marca viraria órfã apontando pra um id morto",
  );
});

// ── total ───────────────────────────────────────────────────────────────────

test("o total é o que ainda VAI sair, não o que já saiu", () => {
  const db = freshDb();
  //> O aluguel já caiu em abril: o saldo da conta já o reflete, então somá-lo
  //> descontaria duas vezes. Salário é entrada, nunca compromisso.
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  marcarRecorrente(db, lancamento(db, "2026-04-05", 400000, "Salário", "income"));

  const out = getCommitments(db, "2026-04");
  assert.equal(out.total_out, 0);
  assert.equal(out.recurring.length, 2, "mas as duas continuam visíveis na lista");
});

test("recorrente que ainda não caiu no mês entra no total", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  const out = getCommitments(db, "2026-06");
  assert.equal(out.total_out, 1200);
  assert.equal(out.total_recurring, 1200);
  assert.equal(out.total_invoices, 0);
});

test("parcela aparece na lista mas NÃO soma — é item de fatura", () => {
  const db = freshDb();
  //> Toda parcela tem `invoice_id`. Quem responde pelo cartão é a fatura em aberto;
  //> somar a parcela em separado contaria o mesmo dinheiro duas vezes.
  parcela(db, "2026-04-11", 12000, 2, 3);
  const out = getCommitments(db, "2026-04");
  assert.equal(out.installments.length, 1, "visível");
  assert.equal(out.total_out, 0, "mas não somada");
});

test("fatura aberta vencendo no mês é o que responde pelo cartão", () => {
  const db = freshDb();
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file) VALUES ('cartao-b','2026-04','2026-04-20',18000,'ui')",
  ).run();
  const out = getCommitments(db, "2026-04");
  assert.equal(out.total_invoices, 180);
  assert.equal(out.total_out, 180);
});

test("fatura já paga não compromete nada", () => {
  const db = freshDb();
  const pag = lancamento(db, "2026-04-20", 18000, "Pagamento fatura");
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file, payment_tx_id) VALUES ('cartao-b','2026-04','2026-04-20',18000,'ui',?)",
  ).run(pag);
  assert.equal(getCommitments(db, "2026-04").total_out, 0);
});

test("mês vazio devolve listas vazias e total zero", () => {
  const out = getCommitments(freshDb(), "2026-04");
  assert.deepEqual(out.installments, []);
  assert.deepEqual(out.recurring, []);
  assert.equal(out.total_out, 0);
  assert.equal(out.month, "2026-04");
});

test("o total não acumula erro de float", () => {
  const db = freshDb();
  //> 31,27 + 31,25 somados como reais dão 62,519999999999996. A soma roda em centavos.
  marcarRecorrente(db, lancamento(db, "2026-01-05", 3127, "Steam"));
  marcarRecorrente(db, lancamento(db, "2026-01-06", 3125, "Spotify"));
  assert.equal(getCommitments(db, "2026-02").total_out, 62.52);
});

// ── prazo da recorrência ────────────────────────────────────────────────────

test("recorrência com prazo some depois do último mês", () => {
  const db = freshDb();
  //> Contrato de 3x declarado recorrente: vale abril, maio e junho — e não julho.
  marcarRecorrente(db, lancamento(db, "2026-04-10", 50000, "Curso"), "2026-06");

  assert.equal(getCommitments(db, "2026-04").recurring.length, 1);
  assert.equal(getCommitments(db, "2026-06").recurring.length, 1, "o mês do prazo AINDA vale");
  assert.equal(getCommitments(db, "2026-07").recurring.length, 0);
});

test("prazo sai no payload pra tela saber até quando", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 50000, "Curso"), "2026-06");
  assert.equal(getCommitments(db, "2026-05").recurring[0].until, "2026-06");
});

test("sem prazo continua indeterminado", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 120000, "Aluguel"));
  assert.equal(getCommitments(db, "2029-12").recurring.length, 1, "aluguel não tem fim declarado");
  assert.equal(getCommitments(db, "2029-12").recurring[0].until, null);
});

test("prazo vencido não entra no total", () => {
  const db = freshDb();
  marcarRecorrente(db, lancamento(db, "2026-04-10", 50000, "Curso"), "2026-05");
  assert.equal(getCommitments(db, "2026-05").total_out, 500);
  assert.equal(getCommitments(db, "2026-06").total_out, 0);
});

// ── encerrar antes do prazo ─────────────────────────────────────────────────

const encerrar = (db: DatabaseSync, id: number, quando: string) =>
  db.prepare("UPDATE recurring_marks SET ended_at = ? WHERE transaction_id = ?").run(quando, id);

test("encerrada para de comprometer o futuro", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  encerrar(db, id, "2026-06-30");

  assert.equal(getCommitments(db, "2026-06").recurring.length, 1, "junho ainda vale");
  assert.equal(getCommitments(db, "2026-07").recurring.length, 0);
  assert.equal(getCommitments(db, "2026-07").total_out, 0);
});

test("encerrar NÃO apaga o mês em que a conta caiu de verdade", () => {
  const db = freshDb();
  //> O aluguel caiu em maio: encerrar em junho não faz maio esquecer que aquilo era
  //> a recorrência. Encerrar afeta o futuro, nunca o que já foi observado.
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  lancamento(db, "2026-08-11", 120000, "Aluguel");
  encerrar(db, id, "2026-06-30");

  const ago = getCommitments(db, "2026-08").recurring;
  assert.equal(ago.length, 1, "agosto tem o lançamento real, então a linha fica");
  assert.equal(ago[0].confirmed, true);
  assert.equal(ago[0].historic, true, "marcada como fora da vigência");
  assert.equal(ago[0].date, "2026-08-11", "e com a data REAL");
});

test("mês fora da vigência e SEM lançamento não inventa linha", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  encerrar(db, id, "2026-06-30");
  assert.deepEqual(getCommitments(db, "2026-09").recurring, []);
});

test("o MÊS do encerramento ainda vale — o dia 20 não desfaz o dia 10", () => {
  const db = freshDb();
  //> Encerrar em 20/05 não apaga maio: caindo todo dia 10, ela JÁ caiu quando você
  //> cancelou. Diferente de conta encerrada, que zera no mês (lá se lê FIM de mês).
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id, "2026-12");
  encerrar(db, id, "2026-05-20");

  assert.equal(getCommitments(db, "2026-05").total_out, 1200, "maio é o último mês vigente");
  assert.equal(getCommitments(db, "2026-06").total_out, 0, "junho já não compromete");
  assert.equal(getCommitments(db, "2026-08").total_out, 0);
});

test("o PLANO sobrevive ao encerramento — é o que dá rastreabilidade", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id, "2027-03");
  encerrar(db, id, "2026-06-30");

  const r = getCommitments(db, "2026-06").recurring[0];
  assert.equal(r.until, "2027-03", "o plano ia até março");
  assert.equal(r.ended, "2026-06-30", "e acabou em junho");
});

test("desmarcar é outra coisa: apaga de TODO mês, inclusive onde caiu", () => {
  const db = freshDb();
  const id = lancamento(db, "2026-04-10", 120000, "Aluguel");
  marcarRecorrente(db, id);
  lancamento(db, "2026-05-11", 120000, "Aluguel");
  assert.equal(getCommitments(db, "2026-05").recurring.length, 1);

  db.prepare("DELETE FROM recurring_marks WHERE transaction_id = ?").run(id);
  assert.equal(getCommitments(db, "2026-05").recurring.length, 0, "'nunca foi recorrente'");
});

// ── recorrência prevista na planilha NÃO dobra o total ───────────────────────

const proxMes = (n: number) => {
  const d = new Date();
  const m = d.getMonth() + n;
  return { year: d.getFullYear() + Math.floor(m / 12), month: (m % 12) + 1 };
};

test("recorrência prevista aparece uma vez no card, não duas", () => {
  const db = freshDb();
  //> Vira linha em `forecast_transactions` (planilha) E segue saindo de
  //> `recorrentesDoMes` (card): lendo as duas, o card somaria a conta em dobro.
  marcarRecorrente(db, lancamento(db, "2020-01-10", 120000, "Aluguel"));
  const { year, month } = proxMes(2);
  const out = getCommitments(db, `${year}-${String(month).padStart(2, "0")}`);

  assert.equal(out.recurring.length, 1);
  assert.equal(out.installments.length, 0, "recorrência não é parcela");
  assert.equal(out.total_out, 1200, "somada UMA vez");
  assert.equal(out.total_installments, 0);
});

test("parcela e recorrência somam cada uma a sua parte", () => {
  const db = freshDb();
  const { year, month } = proxMes(1);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  marcarRecorrente(db, lancamento(db, "2020-01-10", 120000, "Aluguel"));
  //> Uma parcela 1/2 no mês corrente projeta a 2/2 para o mês seguinte.
  const hoje = new Date();
  parcela(db, `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-09`, 5000, 1, 2, "Loja Aurora");

  const out = getCommitments(db, ym);
  assert.equal(out.total_recurring, 1200);
  assert.equal(out.total_installments, 50);
  assert.equal(out.total_out, 1250, "1200 + 50, sem sobreposição");
});

test("a fatura que compõe o total aparece na lista que o explica", () => {
  const db = freshDb();
  //> O card dizia "nenhuma parcela nem recorrente" e o rodapé cobrava o valor da
  //> fatura. Um total sem a lista que o explica é o que este painel existe pra evitar.
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file) VALUES ('cartao-b','2026-04','2026-04-20',18000,'ui')",
  ).run();

  const out = getCommitments(db, "2026-04");
  assert.equal(out.total_out, 180);
  assert.equal(out.invoices.length, 1, "o número tem que ter de onde vir");
  assert.equal(out.invoices[0].amount, 180);
  assert.equal(out.invoices[0].due_date, "2026-04-20");
});

test("fatura paga não entra nem no total nem na lista", () => {
  const db = freshDb();
  const pag = lancamento(db, "2026-04-20", 18000, "Pagamento fatura");
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file, payment_tx_id) VALUES ('cartao-b','2026-04','2026-04-20',18000,'ui',?)",
  ).run(pag);

  const out = getCommitments(db, "2026-04");
  assert.equal(out.total_out, 0);
  assert.deepEqual(out.invoices, []);
});

test("a soma das listas é o total — nada entra sem aparecer", () => {
  const db = freshDb();
  db.prepare(
    "INSERT INTO invoices (account_id, ref_month, due_date, total_cents, source_file) VALUES ('cartao-b','2026-04','2026-04-20',18000,'ui')",
  ).run();
  marcarRecorrente(db, lancamento(db, "2026-01-10", 120000, "Aluguel"));

  const out = getCommitments(db, "2026-04");
  const somaListas = out.invoices.reduce((s: number, i: any) => s + i.amount, 0)
    + out.recurring.filter((r: any) => r.flow === "expense" && !r.confirmed && !r.historic)
        .reduce((s: number, r: any) => s + r.amount, 0)
    + out.installments.filter((p: any) => p.projected).reduce((s: number, p: any) => s + p.amount, 0);
  assert.equal(somaListas, out.total_out);
});
