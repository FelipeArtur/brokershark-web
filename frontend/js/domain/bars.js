(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BS = root.BS || {};
  Object.assign(root.BS, api);
})(typeof self !== "undefined" ? self : globalThis, function () {

  /**
   * @file    Quais barras um mês desenha no "Fluxo mês a mês".
   * @details O mês anterior entra como MARCA DE NÍVEL sobre a própria barra, não como
   *          uma barra ao lado. Lado a lado eram 4 barras por mês, 48 na fileira, e
   *          comparar exigia medir a distância entre dois objetos de altura parecida:
   *          dava para ver que mudou, não para dizer se subiu. Com a marca, a barra
   *          passar da linha JÁ é a resposta.
   */

  const BAR_MAX_PX = 52;
  const BAR_MIN_PX = 2;

  /** Altura em px. Valor > 0 nunca vira barra invisível; maxV 0 não vira NaN. */
  function scaleBar(value, maxV) {
    const v = Number(value) || 0;
    if (v <= 0) return 0;
    if (!(maxV > 0)) return BAR_MIN_PX;
    return Math.max((v / maxV) * BAR_MAX_PX, BAR_MIN_PX);
  }

  /**
   * @brief   Quais barras um mês desenha, com a escala da série.
   * @warning `measured` separa zero MEDIDO de mês sem medição — a altura é 0 nos dois,
   *          e sem o campo a tela desenha o mesmo nada pra afirmações diferentes.
   * @param slot    { data: {income, expenses}|null, prev: {income, expenses}|null }
   * @param maxV    maior valor da série, pra escala comum entre os meses
   * @param compare toggle "vs ant." ligado
   * @returns [{ key, kind: 'income'|'expense', height, measured, markAt, delta }]
   *          `markAt` é a altura do mês anterior (px) ou `null`; `delta` é a variação
   *          em valor, para a marca poder dizer o que aconteceu sem o olho medir.
   */
  function barSpecs(slot, maxV, compare) {
    const d = (slot && slot.data) || null;
    const prev = compare && slot ? slot.prev : null;

    const barra = (key, kind, campo) => {
      //> A marca só existe quando os DOIS meses têm medição: sobre uma barra sem
      //> dado ela não compara nada, e sobre um anterior ausente diria "era zero".
      const compara = !!(d && prev);
      return {
        key, kind, measured: !!d,
        height: d ? scaleBar(d[campo], maxV) : 0,
        //> Teto: `maxV` é a escala do ANO na tela, e o mês anterior pode ser de
        //> dezembro do ano passado — sem o corte a marca sai da moldura.
        markAt: compara ? Math.min(scaleBar(prev[campo], maxV), BAR_MAX_PX) : null,
        delta: compara ? d[campo] - prev[campo] : null,
      };
    };
    return [barra("i", "income", "income"), barra("e", "expense", "expenses")];
  }

  return { barSpecs, scaleBar, BAR_MAX_PX, BAR_MIN_PX };
});
