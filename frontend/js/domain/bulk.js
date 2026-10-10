(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BS = root.BS || {};
  Object.assign(root.BS, api);
})(typeof self !== "undefined" ? self : globalThis, function () {

  function suggestionPlan(groups) {
    return (groups || [])
      .filter(g => g.suggested_category_id != null)
      .map(g => ({
        merchant_key: g.merchant_key,
        flow: g.flow,
        ids: g.ids,
        category_id: g.suggested_category_id,
      }));
  }

  function groupsByFlow(groups) {
    const expense = [];
    const income = [];
    for (const g of (groups || [])) {
      if (g.flow === "income") income.push(g);
      else expense.push(g);
    }
    return { expense, income };
  }

  return { suggestionPlan, groupsByFlow };
});
