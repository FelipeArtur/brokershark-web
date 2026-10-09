import type { FormatId } from "../ingest/registry.ts";

/**
 * @file    O contrato de um adaptador de banco.
 * @details Um adaptador diz duas coisas e nada mais: como o banco se chama e qual
 *          FORMATO cada tipo de conta dele exporta. Ele não traz parser: bancos
 *          diferentes que exportam o mesmo CSV usam o mesmo, e é isso que faz um
 *          banco novo custar dez linhas em vez de um parser inteiro.
 * @warning Um adaptador é uma afirmação sobre o EXPORT do banco, não sobre a conta
 *          de alguém. Saldo, id de conta e apelido continuam vindo do ledger; o
 *          adaptador só sabe o que a instituição publica igual para todo mundo.
 */

export type BankAccountSpec = {
  /** Qual parser lê o arquivo desta conta. */
  format: FormatId;
};

export type BankAdapter = {
  /** Chave estável; é o que `accounts.bank` guarda. Minúsculo, sem espaço. */
  id: string;
  label: string;
  checking?: BankAccountSpec;
  credit_card?: BankAccountSpec;
};

/** O que o adaptador sabe sobre um tipo de conta, ou nada se ele não o oferece. */
export const specFor = (
  bank: BankAdapter | undefined, type: string,
): BankAccountSpec | undefined =>
  type === "checking" ? bank?.checking
    : type === "credit_card" ? bank?.credit_card
    : undefined;
