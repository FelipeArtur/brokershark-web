import type { BankAdapter } from "./types.ts";
import { inter } from "./inter.ts";
import { nubank } from "./nubank.ts";

/**
 * @file    A PORTA dos bancos: quem existe e o que cada um exporta.
 * @details Adicionar um banco é criar o adaptador ao lado e citá-lo aqui. Nada
 *          mais no código sabe o nome de banco nenhum — import, backfill e UI
 *          perguntam ao registro.
 * @warning Banco DESCONHECIDO continua funcionando: a conta guarda o rótulo que
 *          o usuário digitou e o import cai na detecção por conteúdo. O registro
 *          é atalho, nunca porteiro — barrar o que não está aqui transformaria
 *          "ainda não tem adaptador" em "não dá para usar".
 */

const ADAPTERS: BankAdapter[] = [inter, nubank];

export const banks = (): readonly BankAdapter[] => ADAPTERS;

/** `accounts.bank` guarda o id; a comparação ignora caixa e espaço das pontas. */
export const bankById = (id: string | null | undefined): BankAdapter | undefined =>
  id == null ? undefined
    : ADAPTERS.find(b => b.id === String(id).trim().toLowerCase());
