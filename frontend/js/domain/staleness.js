(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BS = root.BS || {};
  Object.assign(root.BS, api);
})(typeof self !== "undefined" ? self : globalThis, function () {

  /**
   * A partir de que dia do mês a ausência do mês anterior vira atraso. Extrato e
   * fatura fecham na primeira semana; cobrar no dia 1º acusaria todo mundo.
   */
  const DIA_DE_COBRANCA = 10;

  /**
   * @brief   O ledger está atrasado em relação a hoje?
   * @details Conta MESES DE CALENDÁRIO, não dias: o acervo chega mensal, então
   *          "há 29 dias" não quer dizer nada e "falta julho inteiro" quer.
   * @param   lastTxDate ISO `YYYY-MM-DD` do lançamento mais recente, ou null.
   * @param   hoje ISO `YYYY-MM-DD`. parâmetro pra ser testável sem mexer no relógio.
   * @returns `{ level, months, label }`. `level`: "ok" | "due" | "late" | "empty".
   */
  function ledgerLag(lastTxDate, hoje) {
    if (!lastTxDate) return { level: "empty", months: 0, label: "Nenhum lançamento no ledger" };

    const [ay, am] = lastTxDate.split("-").map(Number);
    const [hy, hm, hd] = hoje.split("-").map(Number);
    const months = (hy - ay) * 12 + (hm - am);

    if (months <= 0) return { level: "ok", months: 0, label: "" };

    //> Um mês de diferença só é atraso depois que o mês anterior teve tempo de
    //> fechar. Antes disso é o intervalo normal entre um extrato e o próximo.
    if (months === 1 && hd < DIA_DE_COBRANCA) return { level: "ok", months: 1, label: "" };

    return {
      level: months === 1 ? "due" : "late",
      months,
      label: months === 1
        ? "Faltam dados do mês passado"
        : `Faltam dados dos últimos ${months} meses`,
    };
  }

  /**
   * @brief   Hoje em ISO, no fuso LOCAL.
   * @warning Nada de `toISOString()`: é UTC, e das 21h em diante já devolve amanhã —
   *          o aviso mudaria de estado sozinho ao anoitecer. Espelha `domain/dates.ts`.
   */
  function todayISO(d = new Date()) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  return { ledgerLag, todayISO };
});
