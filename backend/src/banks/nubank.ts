import type { BankAdapter } from "./types.ts";

/**
 * @brief Nubank — extrato CSV com identificador único por lançamento.
 * @note  Sem `credit_card`: o cartão não está em uso neste ledger. Adicionar é
 *        declarar o formato aqui, sem tocar em parser nenhum.
 */
export const nubank: BankAdapter = {
  id: "nubank",
  label: "Nubank",
  checking: { format: "ids" },
};
