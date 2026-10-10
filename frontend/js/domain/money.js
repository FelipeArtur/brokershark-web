(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BS = root.BS || {};
  Object.assign(root.BS, api);
})(typeof self !== "undefined" ? self : globalThis, function () {

  const KIND = {
    FORECAST:    "forecast",
    SETTLEMENT:  "settlement",
    TRANSFER:    "transfer",
    INVEST:      "invest",
    THIRD_PARTY: "third_party",
    REVENUE:     "revenue",
    EXPENSE:     "expense",
  };

  /**
   * @brief   A espécie de uma linha de dinheiro. exatamente uma das sete.
   * @warning A ORDEM é load-bearing: previsto antes de tudo (dinheiro que ainda não
   *          se moveu não é gasto de ninguém), liquidação antes de despesa (senão o
   *          consumo dobra), SELF antes de investimento, terceiro antes de investimento.
   */
  function moneyKind(t) {
    if (!t) return null;
    //> Primeiro de todos: o backend não conta previsto em total nenhum, e o front
    //> classificá-lo como despesa faria a planilha discordar do servidor.
    if (t.is_forecast) return KIND.FORECAST;
    if (t.is_settlement) return KIND.SETTLEMENT;
    if (t.counterpart === "SELF" || t.dest_account_id != null) return KIND.TRANSFER;
    if (t.is_third_party) return KIND.THIRD_PARTY;
    //> `transfer` + `is_revenue=1` é receita real pro backend: divergir tirava
    //> dinheiro de "Entradas" sem tirar do total.
    if (t.flow === "expense" ? t.method === "transfer" : (!t.is_revenue && t.method === "transfer")) {
      return KIND.INVEST;
    }
    return t.flow === "income" ? KIND.REVENUE : KIND.EXPENSE;
  }

  const KIND_COLOR = {
    [KIND.FORECAST]:    "var(--warn)",
    [KIND.SETTLEMENT]:  "var(--fg-1)",
    [KIND.TRANSFER]:    "var(--fg-0)",
    [KIND.INVEST]:      "var(--reserve)",
    [KIND.THIRD_PARTY]: "var(--warn)",
    [KIND.REVENUE]:     "var(--pos)",
    [KIND.EXPENSE]:     "var(--neg)",
  };

  const KIND_LABEL = {
    [KIND.FORECAST]:    "Previstos",
    [KIND.SETTLEMENT]:  "Pagamentos de fatura",
    [KIND.TRANSFER]:    "Transferências",
    [KIND.INVEST]:      "Investimentos",
    [KIND.THIRD_PARTY]: "Em nome de terceiros",
    [KIND.REVENUE]:     "Receitas",
    [KIND.EXPENSE]:     "Despesas",
  };

  const KIND_HINT = {
    [KIND.FORECAST]:    "Parcela que o contrato promete e a fatura ainda não trouxe. compromete o saldo disponível, mas fica fora dos totais do que já aconteceu.",
    [KIND.SETTLEMENT]:  "Liquidação de fatura. os gastos reais são os lançamentos da fatura; somar o pagamento duplicaria o consumo.",
    [KIND.TRANSFER]:    "Transferência entre contas próprias. não contabiliza como despesa nem receita.",
    [KIND.INVEST]:      "Movimentação de investimento. não contabiliza como despesa nem receita.",
    [KIND.THIRD_PARTY]: "Dinheiro movimentado em nome de terceiros. não entra nos seus totais pessoais.",
    [KIND.REVENUE]:     null,
    [KIND.EXPENSE]:     null,
  };

  function kindSign(t) {
    return (t && t.flow === "income") ? "+" : "−";
  }

  function fmtParts(v) {
    const n = Math.abs(v ?? 0);
    const full = n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const cut = full.lastIndexOf(",");
    return cut < 0 ? { int: full, cents: "" }
                   : { int: full.slice(0, cut), cents: full.slice(cut) };
  }

  return { KIND, moneyKind, kindSign, KIND_COLOR, KIND_LABEL, KIND_HINT, fmtParts };
});
