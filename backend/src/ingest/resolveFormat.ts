import { detectFormat, formatById, type FormatId } from "./registry.ts";
import { bankById } from "../banks/registry.ts";
import { specFor } from "../banks/types.ts";

/**
 * @brief   Que formato usar para ler o arquivo desta conta.
 * @details Três fontes, nesta ordem: a CONFIG é override explícito de quem usa; o
 *          ADAPTADOR é o que se sabe do banco; o FAREJADOR é o último recurso.
 * @warning A ordem é load-bearing. Pôr o farejador antes faria uma conta com
 *          formato declarado à mão ser lida pelo palpite do arquivo, e o palpite
 *          erra justamente nos casos em que alguém precisou declarar.
 * @returns `null` quando nada resolve — aí o import recusa em vez de adivinhar.
 */
export function resolveStatementFormat(opts: {
  /** O que `config/*.json` declara para a conta, se declarar. */
  declared?: string | null;
  /** `accounts.bank` — casa com um adaptador ou não. */
  bank?: string | null;
  /** 'checking' | 'credit_card'. */
  accountType?: string | null;
  /** Começo do arquivo, para o último recurso. */
  content?: string | null;
}): FormatId | null {
  const daConfig = formatById(opts.declared)?.id;
  if (daConfig) return daConfig;

  const doBanco = specFor(bankById(opts.bank), opts.accountType ?? "checking")?.format;
  if (doBanco) return doBanco;

  return opts.content ? detectFormat(opts.content) : null;
}
