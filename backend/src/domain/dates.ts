/**
 * @brief Mês e ano correntes do relógio local.
 */
export function currentMonth(): { month: number; year: number } {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/**
 * @brief Primeiro e último dia do mês, em ISO.
 */
export function monthRange(month: number, year: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * @brief   Hoje em ISO, no fuso LOCAL.
 * @warning Nada de `toISOString()` (é UTC: das 21h em diante já vira amanhã) nem de
 *          `toLocaleDateString("sv-SE")` (com `small-icu` cai calado no en-US e dá `7/30/2026`).
 */
export function today(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * @brief `YYYY-MM` deslocado em N meses (N negativo anda pra trás).
 */
export function addMonths(refMonth: string, n: number): string {
  const y = Number(refMonth.slice(0, 4));
  const m = Number(refMonth.slice(5, 7)) - 1 + n;
  const mm = ((m % 12) + 12) % 12;
  return `${y + Math.floor(m / 12)}-${String(mm + 1).padStart(2, "0")}`;
}

/**
 * @brief Mês anterior a um `YYYY-MM`.
 */
export const prevRefMonth = (refMonth: string): string => addMonths(refMonth, -1);
