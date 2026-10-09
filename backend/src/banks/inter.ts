import type { BankAdapter } from "./types.ts";

/**
 * @brief Banco Inter — extrato com saldo corrente, fatura item a item.
 */
export const inter: BankAdapter = {
  id: "inter",
  label: "Inter",
  checking: { format: "running-balance" },
  credit_card: { format: "itemized" },
};
