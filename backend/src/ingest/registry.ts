import type { LedgerVocabulary } from "../config.ts";
import type { ParsedFile } from "./types.ts";
import { parseStatementWithIds } from "./statementWithIds.ts";
import { parseStatementWithBalance } from "./statementWithBalance.ts";

/**
 * @file    A PORTA da ingestão: formato → parser, farejador e rótulo, num lugar só.
 * @details O dispatch vivia escrito duas vezes — um ternário em `routes/import.ts` e
 *          outro em `jobs/backfill/extratos.ts` — e `detectFormat` morava dentro de
 *          uma rota HTTP. Formato novo exigia lembrar dos dois, e esquecer um deixava
 *          o import da UI e o backfill lendo o mesmo arquivo de jeitos diferentes.
 * @warning O farejador olha o ARQUIVO, nunca o banco. Bancos diferentes que exportem
 *          o mesmo CSV usam o mesmo parser, e é isso que faz um banco novo custar uma
 *          entrada de adaptador em vez de um parser.
 */

export type StatementFormatId = "ids" | "running-balance";
export type InvoiceFormatId = "itemized";
export type FormatId = StatementFormatId | InvoiceFormatId;

export type StatementParser = (
  text: string, sourceFile: string, accountId: string, vocab: LedgerVocabulary,
) => ParsedFile;

export type FormatSpec = {
  id: FormatId;
  /** Como a tela chama isto — a UI lista daqui, nunca de uma constante própria. */
  label: string;
  kind: "statement" | "invoice";
  /** O conteúdo é deste formato? Só o cabeçalho decide. */
  sniff: (head: string) => boolean;
  /** Ausente na fatura: ela entra por outro fluxo (`faturaImport`). */
  parse?: StatementParser;
};

const FORMATS: FormatSpec[] = [
  {
    id: "ids",
    label: "Extrato com identificador por lançamento",
    kind: "statement",
    sniff: h => h.includes("identificador") && h.includes("valor"),
    parse: parseStatementWithIds,
  },
  {
    id: "running-balance",
    label: "Extrato com saldo corrente",
    kind: "statement",
    sniff: h => h.includes("data lançamento") || h.includes("data lancamento"),
    parse: parseStatementWithBalance,
  },
  {
    id: "itemized",
    label: "Fatura de cartão item a item",
    kind: "invoice",
    sniff: h => h.includes("categoria") && h.includes("tipo") && h.includes("valor"),
  },
];

export const formats = (): readonly FormatSpec[] => FORMATS;

export const formatById = (id: string | null | undefined): FormatSpec | undefined =>
  FORMATS.find(f => f.id === id);

export const isStatementFormat = (id: string): id is StatementFormatId =>
  formatById(id)?.kind === "statement";

/**
 * @brief   Que formato é este arquivo?
 * @warning Só o começo do conteúdo entra na decisão: ler o arquivo inteiro para
 *          farejar cabeçalho é trabalho jogado fora num upload de 20MB.
 */
export function detectFormat(csv: string): FormatId | null {
  const head = csv.slice(0, 4096).toLowerCase();
  return FORMATS.find(f => f.sniff(head))?.id ?? null;
}

/**
 * @brief   O parser daquele formato.
 * @throws  Quando o formato não lê extrato — é bug de chamada, não entrada ruim.
 */
export function statementParser(id: FormatId): StatementParser {
  const spec = formatById(id);
  if (!spec?.parse) throw new Error(`formato '${id}' não lê extrato`);
  return spec.parse;
}
