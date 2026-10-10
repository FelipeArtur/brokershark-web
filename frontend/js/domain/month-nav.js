(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BS = root.BS || {};
  Object.assign(root.BS, api);
})(typeof self !== "undefined" ? self : globalThis, function () {

  /**
   * @file    Salto de um ano na barra do topo. a navegação era um mês por clique.
   * @warning `monthly` é ESPARSO: índice ± 12 não é um ano. O salto mira a DATA e
   *          aterrissa no mês existente mais próximo.
   */

  const ordinal = (m) => m.year * 12 + m.month;

  /**
   * @brief   Índice do mês mais próximo de `delta` anos do selecionado.
   * @details Devolve o índice atual quando não há pra onde ir. o chamador usa essa
   *          igualdade pra desabilitar o botão. Empate resolve pelo mais antigo.
   * @param monthly  [{year, month}, …] crescente, esparso
   * @param monthSel {year, month} atual
   * @param delta    anos: -1 volta, +1 avança
   */
  function jumpYearIndex(monthly, monthSel, delta) {
    if (!Array.isArray(monthly) || !monthly.length || !monthSel) return -1;
    const cur = monthly.findIndex(m => m.year === monthSel.year && m.month === monthSel.month);
    const target = ordinal(monthSel) + delta * 12;

    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < monthly.length; i++) {
      const dist = Math.abs(ordinal(monthly[i]) - target);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    //> Aterrissar no próprio mês deixa o botão morto, sem clique que não muda nada.
    return best === -1 ? cur : best;
  }

  /** Há para onde saltar? Falso quando o salto cairia no mês atual. */
  function canJumpYear(monthly, monthSel, delta) {
    if (!Array.isArray(monthly) || !monthly.length || !monthSel) return false;
    const cur = monthly.findIndex(m => m.year === monthSel.year && m.month === monthSel.month);
    const to = jumpYearIndex(monthly, monthSel, delta);
    return to >= 0 && to !== cur;
  }

  /** Até onde a navegação vai pra frente, a partir do mês corrente. */
  const HORIZONTE_MESES = 12;

  /**
   * @brief   Os meses NAVEGÁVEIS: os que têm dado, mais o futuro pra planejar.
   * @details `monthly` só lista mês COM lançamento, então parava no último import e
   *          não havia como olhar pra frente. Mês futuro não tem fluxo medido. tem
   *          parcela prevista e recorrência declarada, que é do que planejamento vive.
   * @warning Devolve os meses FUTUROS com `future: true` e sem `income`/`expenses`.
   *          Somar zero neles faria a média mensal despencar e o gráfico desenhar
   *          uma queda que é ausência de dado, não de dinheiro.
   */
  function navigableMonths(monthly, hojeIso, horizonte = HORIZONTE_MESES) {
    const base = Array.isArray(monthly) ? monthly : [];
    if (!hojeIso) return base;

    const [hy, hm] = hojeIso.split("-").map(Number);
    const hoje = hy * 12 + hm;
    const vistos = new Set(base.map(m => ordinal(m)));
    const extras = [];

    //> Começa no mês seguinte ao último com dado, não no corrente: senão o VÃO
    //> entre o último import e hoje fica fora da régua. justo o que falta importar.
    const inicio = base.length
      ? Math.min(hoje, base.reduce((max, m) => Math.max(max, ordinal(m)), -Infinity) + 1)
      : hoje;
    for (let o = inicio; o <= hoje + horizonte; o++) {
      const year = Math.floor((o - 1) / 12);
      const month = ((o - 1) % 12) + 1;
      if (vistos.has(year * 12 + month)) continue;
      //> Mês do vão é PASSADO sem import. chamá-lo de futuro faria quem ler o
      //> flag tratar ausência de dado como planejamento.
      extras.push({ year, month, label: `${String(month).padStart(2, "0")}/${year}`, future: o >= hoje });
    }
    return [...base, ...extras].sort((a, b) => ordinal(a) - ordinal(b));
  }

  /**
   * @brief Quantos meses de `de` até `ate`, contando os dois. `YYYY-MM`.
   * @note  Vivia copiada na ficha do lançamento e no card do comprometido; as duas
   *        respondem "quantas vezes isto ainda cai", e divergir daria contagens
   *        diferentes pro mesmo contrato em duas telas.
   */
  function monthSpan(de, ate) {
    if (!de || !ate) return 0;
    return (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12
      + (Number(ate.slice(5, 7)) - Number(de.slice(5, 7))) + 1;
  }

  return { jumpYearIndex, canJumpYear, navigableMonths, monthSpan };
});
