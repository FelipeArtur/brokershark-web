(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _dSt, useEffect: _dEf, useMemo: _dMemo, useCallback: _dCb } = React;
const { fmtBRL, fmtBRLCompact, fmtCompact, fmtDateBR, PT_MONTHS, PT_SHORT,
        isConsumptionExpense, bankColor, bankShortLabel, fullDateBR } = window.BS;

window.BS = window.BS || {};
const SEM_FLUXO = "Nenhum lançamento neste mês. Zero seria uma afirmação de que "
  + "nada entrou nem saiu; o que há é ausência de dado — importe o extrato do mês.";

/**
 * @brief   O mês tem fluxo MEDIDO?
 * @details Mês sem lançamento não teve "resultado zero": teve ausência de import.
 *          Vale igual para o futuro (ainda não aconteceu) e para o mês corrente com
 *          o extrato atrasado, que era onde o painel afirmava −R$ 0,00 em Categorias
 *          e +R$ 0,00 em Resultado do Mês.
 * @warning Previsto não conta como medição: ele é justamente o que ainda não caiu.
 */
const temFluxo = (monthTx) => (monthTx || []).some(t => !t.is_forecast);

/**
 * @brief   A posição é do mês pedido, ou é uma sobra do último import?
 * @details Com o ledger parado em 22/06 e hoje em agosto, "R$ 5.151,40" é o saldo
 *          de junho carregado pra frente. Mostrá-lo sob "Disponível Agora" afirma
 *          um saldo de hoje que ninguém mediu — a mesma extrapolação que o mês
 *          futuro fazia, só que com nome de fato.
 */
const posicaoVelha = (position) =>
  !!position && !position.is_future && !position.has_data;

const SEM_POSICAO = window.BS.SEM_POSICAO = "Mês futuro não tem saldo — o ledger só sabe o que já aconteceu. "
  + "O que se conhece daqui pra frente são os compromissos, no card Comprometido.";

const INV_TYPE_LABEL = {
  rdb: "Reserva (RDB)", cdb: "CDB / Renda fixa", tesouro: "Tesouro Direto",
  lci: "LCI / Renda fixa", lca: "LCA / Renda fixa", savings: "Poupança",
};

function Delta({ value, suffix = "vs mês anterior", invert = false }) {
  if (value == null) return null;
  const good = invert ? value <= 0 : value >= 0;
  return h(React.Fragment, null,
    h("span", { className: "kpi-delta", style: { color: good ? "var(--pos)" : "var(--neg)" } },
      (value >= 0 ? "+" : "−") + fmtBRL(Math.abs(value))),
    h("span", { style: { color: "var(--fg-3)" } }, suffix)
  );
}

/**
 * @brief   A faixa de KPIs — posição no topo, resultado do mês no meio.
 * @details Os três cartões de POSIÇÃO acompanham o seletor de mês: no mês corrente
 *          são "agora" (`/api/available`, com o comprometido descontado), e num mês
 *          fechado são o fim daquele mês (`/api/position`). Antes eram sempre "agora"
 *          com um Δ lido do fim da série: navegando pra março, a tela inteira falava
 *          de março e três cartões falavam de hoje.
 * @warning Num mês fechado NÃO se desconta comprometido: tudo que ia sair já saiu, e
 *          o saldo de fim de mês já reflete. Descontar de novo tiraria duas vezes.
 */
const KpiStrip = React.memo(function KpiStrip({ available, availErr, accounts, cashflow, investTotal,
                    position, monthSel, monthTx }) {
  const semFluxo = !temFluxo(monthTx);

  //> Três estados: FECHADO tem posição medida, CORRENTE é "agora", FUTURO não tem
  //> saldo nenhum — o de hoje ali seria imaginar quanto você vai ter em dezembro.
  const passado = !!position && !position.is_current && !position.is_future;
  const futuro = !!position && position.is_future;
  //> Sem lançamento no mês, o número existe mas é de outra data: vira nota, não título.
  const velha = posicaoVelha(position);
  const oculta = futuro || velha;

  const checkingTotal = oculta ? null : passado ? position.checking_total : (available ? available.checking_total : 0);
  const investido = oculta ? null : passado ? position.invested_total : investTotal;
  const patrimonio = oculta ? null : passado ? position.net_worth : checkingTotal + investido;

  //> `/api/position` já devolve `null` quando o mês ou o anterior não tem medição
  //> — futuro incluso. Repetir a condição aqui daria dois lugares para divergir.
  const patDelta = position ? position.delta_net_worth : null;
  const invDelta = position ? position.delta_invested : null;

  const mesNome = monthSel ? PT_MONTHS[monthSel.month].toLowerCase() : "";
  const vsMes = monthSel
    ? "vs " + PT_SHORT[monthSel.month === 1 ? 12 : monthSel.month - 1].toLowerCase()
    : "vs mês passado";

  const committed = (!passado && !oculta && available && available.committed_this_month) ? available.committed_this_month : 0;
  const availValue = oculta ? null : passado ? position.checking_total : (available ? available.available_net : null);
  const availNeg = availValue != null && availValue < 0;

  const inc = cashflow ? cashflow.income_total : 0;
  const exp = cashflow ? cashflow.expense_total : 0;
  const invNet = cashflow ? cashflow.investment_net : 0;
  const livre = inc - exp - invNet;

  //> Desempate por nome: ordenar por prefixo de id só funcionaria pra uma config.
  const checking = (accounts || []).filter(a => a.type === "checking")
    .sort((a, b) => (b.balance || 0) - (a.balance || 0) || String(a.name || "").localeCompare(String(b.name || "")));

  return h("div", { className: "kpi-strip" },

    h("div", { className: "kpi kpi-hero" },
      h("span", { className: "kpi-label" },
        futuro ? `Em Caixa em ${mesNome}`
          : velha ? "Em Caixa (sem dados de " + mesNome + ")"
          : passado ? `Em Caixa no fim de ${mesNome}` : "Em Caixa (Disponível Agora)"),
      availErr
        ? h("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--neg)" } }, "falha ao carregar")
        : availValue == null
          ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_POSICAO }, "—")
          : h("span", { className: "kpi-value", style: { color: availNeg ? "var(--neg)" : "var(--fg-0)" } },
              (availNeg ? "−" : "") + fmtBRL(Math.abs(availValue))),
      h("span", { className: "kpi-sub" },
        futuro
          ? h("span", { style: { color: "var(--fg-3)" } }, "o saldo só existe até o mês corrente")
          : velha
          ? h("span", { style: { color: "var(--fg-3)", lineHeight: 1.5 } },
              `último saldo conhecido ${fmtBRL(position.checking_total)}, de ${fullDateBR(position.as_of)}`)
          : checking.map(a => h("span", { key: a.id, style: { display: "inline-flex", gap: 5, alignItems: "baseline" } },
              h("span", { style: { color: bankColor(a.bank, a.id), fontWeight: 700 } }, bankShortLabel(a.bank, a.id)),
              h("span", { className: "mono", style: { color: "var(--fg-1)", fontSize: 11 } }, fmtBRL(a.balance || 0))
            )),
        committed > 0 && h("span", {
          className: "mono",
          style: { color: "var(--warn)", fontSize: 11, marginTop: 2, display: "block" },
          "data-tip": [
            available.committed_invoices > 0 && `fatura ${fmtBRL(available.committed_invoices)}`,
            available.committed_recurring > 0 && `recorrente ${fmtBRL(available.committed_recurring)}`,
            available.committed_installments > 0 && `parcela prevista ${fmtBRL(available.committed_installments)}`,
          ].filter(Boolean).join(" · "),
        }, "− Comprometido este mês " + fmtBRL(committed))
      ),
    ),

    h("div", { className: "kpi" },
      h("span", { className: "kpi-label" },
        futuro ? `Patrimônio em ${mesNome}`
          : velha ? "Patrimônio (sem dados)"
          : passado ? `Patrimônio no fim de ${mesNome}` : "Patrimônio Consolidado"),
      patrimonio == null
        ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_POSICAO }, "—")
        : h("span", { className: "kpi-value", "data-tip": `Caixa ${fmtBRL(checkingTotal)} + investimentos ${fmtBRL(investido)}` },
            (patrimonio < 0 ? "−" : "") + fmtBRL(Math.abs(patrimonio))),
      h("span", { className: "kpi-sub" }, h(Delta, { value: patDelta, suffix: vsMes }))
    ),

    h("div", { className: "kpi" },
      h("span", { className: "kpi-label" }, "Resultado do Mês"),
      //> Zero é uma AFIRMAÇÃO: "+R$ 0,00" em dezembro diz que o mês vai fechar no
      //> zero. Mês futuro não tem fluxo medido, e o traço diz isso sem inventar.
      semFluxo
        ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_FLUXO }, "—")
        : h("span", { className: "kpi-value", style: { color: livre >= 0 ? "var(--pos)" : (inc === 0 ? "var(--warn)" : "var(--neg)") } },
            (livre >= 0 ? "+" : "−") + fmtBRL(Math.abs(livre))),
      h("span", { className: "kpi-sub" },
        !semFluxo && h("span", { className: "mono", style: { color: "var(--pos)" } }, "+" + fmtBRL(inc)),
        !semFluxo && h("span", { className: "mono", style: { color: "var(--neg)" } }, "−" + fmtBRL(exp)),
        !semFluxo && invNet !== 0 && h("span", { className: "mono", style: { color: invNet > 0 ? "var(--reserve)" : "var(--info)" }, "data-tip": invNet > 0 ? "aplicado líquido" : "resgatado líquido" },
          (invNet > 0 ? "→inv " : "←inv ") + fmtBRL(Math.abs(invNet))),
        semFluxo && h("span", { style: { color: "var(--fg-3)" } },
          futuro ? "mês ainda não aconteceu" : "sem lançamento importado")
      )
    ),

    h("div", { className: "kpi" },
      h("span", { className: "kpi-label" },
        futuro ? `Investido em ${mesNome}`
          : velha ? "Investido (sem dados)"
          : passado ? `Investido no fim de ${mesNome}` : "Total Investido"),
      investido == null
        ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_POSICAO }, "—")
        : h("span", { className: "kpi-value", style: { color: "var(--reserve)" } }, fmtBRL(investido)),
      h("span", { className: "kpi-sub" }, h(Delta, { value: invDelta, suffix: vsMes }))
    )
  );
});

const GeneralWidget = React.memo(function GeneralWidget({ cashflow, liquidityHistory, monthSel, position,
                         monthTx, uncatCount, onOpenBulk, commitments, onOpenCommitments }) {
  const futuro = !!position && position.is_future;
  //> Mês sem lançamento não teve "saldo livre zero": teve ausência de import.
  const semFluxo = !temFluxo(monthTx);

  const inc = cashflow ? cashflow.income_total : 0;
  const exp = cashflow ? cashflow.expense_total : 0;
  const invNet = cashflow ? cashflow.investment_net : 0;
  const livre = inc - exp - invNet;
  const comprometido = (commitments && commitments.total_out) || 0;
  const monName = monthSel ? PT_MONTHS[monthSel.month].toLowerCase() : "";

  const parts = [];
  //> Fluxo medido só existe depois que o mês aconteceu: no futuro o resumo mostra
  //> só o comprometido, porque zerar entradas e saídas seria prever que nada vem.
  if (!semFluxo) parts.push(h("div", { key: "i", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Entradas (receitas)"),
    h("b", { className: "mono", style: { color: "var(--pos)", fontSize: 13 } }, "+" + fmtBRL(inc))
  ));
  if (!semFluxo) parts.push(h("div", { key: "e", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Saídas (despesas)"),
    h("b", { className: "mono", style: { color: "var(--neg)", fontSize: 13 } }, "−" + fmtBRL(exp))
  ));
  if (!semFluxo && invNet > 0) parts.push(h("div", { key: "v", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Aplicações líquidas"),
    h("b", { className: "mono", style: { color: "var(--reserve)", fontSize: 13 } }, fmtBRL(invNet))
  ));
  if (!semFluxo && invNet < 0) parts.push(h("div", { key: "v", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Resgates líquidos"),
    h("b", { className: "mono", style: { color: "var(--info)", fontSize: 13 } }, fmtBRL(-invNet))
  ));
  if (!semFluxo) parts.push(h("div", { key: "s", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line-1)" } },
    h("span", { style: { color: "var(--fg-1)", fontWeight: 600 } }, "Saldo livre no mês"),
    h("b", { className: "mono", style: { color: livre >= 0 ? "var(--pos)" : "var(--neg)", fontSize: 14 } }, (livre >= 0 ? "+" : "−") + fmtBRL(Math.abs(livre)))
  ));

  //> O comprometido entra na CONTA, não numa nota de rodapé: "sobrou 474" é falso se
  //> 243 já têm dono. A linha é o gatilho do drill-down, e o número mora só aqui.
  parts.push(h("button", {
    key: "c",
    onClick: onOpenCommitments,
    className: "resumo-linha",
    "data-tip": comprometido > 0
      ? "Parcelas e recorrentes que ainda vão sair neste mês — clique para ver a lista"
      : "Nada comprometido neste mês — clique para ver como parcela e recorrente aparecem",
  },
    h("span", { style: { color: "var(--fg-2)" } }, "Comprometido ", h("span", { style: { color: "var(--fg-3)" } }, "→")),
    h("b", { className: "mono", style: { color: comprometido > 0 ? "var(--warn)" : "var(--fg-3)", fontSize: 13 } },
      comprometido > 0 ? "−" + fmtBRL(comprometido) : "—")
  ));

  //> Só aparece quando há o que descontar: sem compromisso, "sobra projetada" seria
  //> uma segunda linha repetindo o saldo livre.
  if (comprometido > 0 && !semFluxo) {
    const sobra = livre - comprometido;
    parts.push(h("div", { key: "p", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--line-2)" } },
      h("span", { style: { color: "var(--fg-0)", fontWeight: 700 } }, "Sobra projetada"),
      h("b", { className: "mono", style: { color: sobra >= 0 ? "var(--pos)" : "var(--neg)", fontSize: 14 } },
        (sobra >= 0 ? "+" : "−") + fmtBRL(Math.abs(sobra)))
    ));
  }

  //> Do MÊS SELECIONADO. Ler o fim da série fazia o cabeçalho de março anunciar a
  //> evolução de junho, ao lado de um resumo que fala de março.
  const patDelta = position ? position.delta_net_worth
    : (liquidityHistory.length > 1
        ? liquidityHistory[liquidityHistory.length - 1].value - liquidityHistory[liquidityHistory.length - 2].value : null);

  return h("div", { className: "widget wg-4" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Visão Geral do Mês"),
      patDelta != null && h("span", { style: { marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "baseline" } },
        h("span", { className: "kpi-delta", style: { color: patDelta >= 0 ? "var(--pos)" : "var(--neg)" } },
          (patDelta >= 0 ? "+" : "−") + fmtBRLCompact(patDelta)),
        h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" } }, "evolução patrimonial"))
    ),
    h("div", { className: "widget-body", style: { gap: 16 } },

      h("div", { style: { fontSize: 12, lineHeight: 1.4, color: "var(--fg-1)" } },
        h("div", { style: { color: "var(--fg-0)", fontWeight: 700, textTransform: "capitalize", marginBottom: 8 } }, `Resumo de ${monName}`),
        semFluxo && h("div", { style: { color: "var(--fg-3)", marginBottom: 6, lineHeight: 1.5 } },
          futuro ? "Mês ainda não aconteceu." : "Nenhum lançamento importado neste mês."),
        ...parts
      ),

      h("div", { style: { marginTop: "auto", display: "flex", flexDirection: "column" } },
        uncatCount > 0 && h("button", {
          className: "stat-row",
          onClick: onOpenBulk,
          "data-tip": "Abrir a categorização em lote",
          style: { width: "100%", textAlign: "left", cursor: "pointer", color: "var(--warn)" },
        },
          h("span", { className: "k", style: { color: "var(--warn)" } }, "Esperando categoria"),
          h("span", { className: "v mono", style: { color: "var(--warn)" } }, `${uncatCount} →`)),
      )
    )
  );
});

/**
 * @brief   O que o mês diz no hover: cabeçalho, receita, despesa e a variação.
 * @details Colunas, não frase corrida: o balão é mono, então `padStart` alinha os
 *          valores pela vírgula e as setas entre si.
 * @warning Os deltas saem de `barSpecs`, a mesma fonte da marca de nível —
 *          recalculá-los faria o balão discordar da linha que ele explica.
 */
function textoDoMes(slot, year, maxV, compare) {
  const d = slot.data;
  const cabeca = `${PT_MONTHS[slot.month]} ${year}`.toUpperCase();
  //> Futuro e mês sem import não são a mesma ausência: um ainda não aconteceu, o
  //> outro aconteceu e ninguém importou.
  if (!d) return `${cabeca}\n${slot.porVir ? "ainda não aconteceu — só o previsto" : "sem lançamentos"}`;

  const specs = window.BS.barSpecs(slot, maxV, compare);
  //> Seta separada do número: "▲" numa despesa não é a notícia que é numa receita,
  //> e o balão não tem cor pra dizer qual é. Sem "R$": a coluna ao lado já o diz.
  const variacao = kind => {
    const dl = (specs.find(s => s.kind === kind) || {}).delta;
    if (dl == null) return null;
    return dl === 0 ? { seta: "=", num: "igual" }
                    : { seta: dl > 0 ? "▲" : "▼", num: fmtCompact(Math.abs(dl)) };
  };

  const vals = [fmtBRL(d.income), fmtBRL(d.expenses)];
  const vars = [variacao("income"), variacao("expense")];
  const lv = Math.max(...vals.map(v => v.length));
  const ln = Math.max(...vars.map(v => (v ? v.num.length : 0)));
  const linha = (rot, i) =>
    `${rot.padEnd(4)} ${vals[i].padStart(lv)}`
    + (vars[i] ? `   ${vars[i].seta} ${vars[i].num.padStart(ln)}` : "");

  //> O ano entra quando a referência é de outro: comparar janeiro com "dezembro"
  //> sem dizer de qual ano deixa a conta no ar.
  const ref = compare && slot.prev
    ? `\nvs ${PT_MONTHS[slot.prev.month].toLowerCase()}`
      + (slot.prev.year !== year ? ` de ${slot.prev.year}` : "")
    : "";
  return `${cabeca}\n${linha("rec", 0)}\n${linha("desp", 1)}${ref}`;
}

const TimelineWidget = React.memo(function TimelineWidget({ monthly, monthSel, onPickMonth }) {
  const now = new Date();
  const [browsingYear, setBrowsingYear] = _dSt(null);
  const [compare, setCompare] = _dSt(false);
  const activeYear = browsingYear || (monthSel ? monthSel.year : now.getFullYear());
  //> Os anos vêm dos meses NAVEGÁVEIS: sem isso, 2027 não existia na aba e não
  //> havia como chegar num mês de planejamento pelo gráfico.
  const nav = window.BS.navigableMonths(monthly, window.BS.todayISO());
  const years = [...new Set(nav.map(m => m.year))].sort((a, b) => a - b);

  const slots = [];
  for (let m = 1; m <= 12; m++) {
    const data = monthly.find(x => x.year === activeYear && x.month === m);
    const idx = monthly.indexOf(data);
    const prev = idx > 0 ? monthly[idx - 1] : null;
    //> Sem barra, mas clicável: mês futuro não tem fluxo medido — tem parcela
    //> prevista e recorrência declarada, que é o que o painel mostra lá.
    const navMes = nav.find(x => x.year === activeYear && x.month === m);
    //> `porVir` sai do flag de `navigableMonths`, não de "navegável e sem dado": o
    //> vão entre o último import e hoje também é os dois, e não é futuro.
    slots.push({ month: m, data, prev, futuro: !data && !!navMes, porVir: !!navMes && !!navMes.future });
  }
  const maxV = Math.max(...slots.map(s => s.data ? Math.max(s.data.income, s.data.expenses) : 0), 1);
  const sel = monthSel && monthly.find(x => x.year === monthSel.year && x.month === monthSel.month);

  return h("div", { className: "widget wg-6" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Fluxo mês a mês"),
      h("button", { onClick: () => setCompare(c => !c), className: "px-seg-btn" + (compare ? " active" : ""),
        style: { marginLeft: "auto" }, "data-tip": "Comparar com o mês anterior" }, "vs ant."),
      h("span", { style: { display: "flex", gap: 10, fontSize: 11, color: "var(--fg-3)", alignItems: "center" } },
        h("span", { style: { display: "inline-flex", alignItems: "center", gap: 3 } },
          h("span", { style: { width: 7, height: 7, background: "var(--pos)" } }), "rec"),
        h("span", { style: { display: "inline-flex", alignItems: "center", gap: 3 } },
          h("span", { style: { width: 7, height: 7, background: "var(--neg)" } }), "desp"),
        //> A marca precisa de legenda: uma linha atravessando a barra não se explica
        //> sozinha, e sem isso o toggle continuaria não dizendo nada.
        compare && h("span", {
          style: { display: "inline-flex", alignItems: "center", gap: 4 },
          "data-tip": "A linha marca o nível do mês anterior. Barra acima dela quer dizer que subiu; linha tracejada flutuando acima da barra quer dizer que caiu.",
        }, h("span", { style: { width: 12, height: 2, background: "var(--fg-0)" } }), "mês ant."))
    ),
    //> Padding e gap menores que o padrão: a fileira precisa de 100px e o corpo dava
    //> 91, cortando o saldo. Saiu da margem — encolher a barra é encolher o gráfico.
    h("div", { className: "widget-body", style: { gap: 6, padding: "10px 14px", overflow: "hidden" } },
      h("div", { style: { display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", flexShrink: 0 } },
        years.map(y => h("button", {
          key: y, onClick: () => setBrowsingYear(y),
          style: {
            fontSize: 10, fontFamily: "var(--ff-mono)", fontWeight: activeYear === y ? 700 : 500,
            color: activeYear === y ? "var(--fg-0)" : "var(--fg-3)", padding: "1px 0", flexShrink: 0,
            borderBottom: activeYear === y ? "2px solid var(--accent)" : "2px solid transparent",
          }
        }, y))
      ),
      h("div", {
        style: { display: "flex", gap: 2, alignItems: "stretch", flex: 1, minHeight: 0 },
      },
        slots.map((slot) => {
          const d = slot.data;
          const isPicked = d && monthSel && d.year === monthSel.year && d.month === monthSel.month;
          const isCur = activeYear === now.getFullYear() && slot.month === now.getMonth() + 1;
          const net = d ? d.income - d.expenses : 0;
          //> `aria-disabled`, não `disabled`: botão desligado não dispara hover, e o
          //> mês sem lançamento perderia a única frase que explica por que está vazio.
          const selecionavel = d || slot.futuro;
          const marcado = isPicked
            || (slot.futuro && monthSel && monthSel.year === activeYear && monthSel.month === slot.month);
          return h("button", {
            key: slot.month,
            className: `tl-slot${marcado ? " picked" : ""}${d ? "" : " tl-slot--empty"}${slot.futuro ? " tl-slot--futuro" : ""}`,
            "aria-disabled": selecionavel ? undefined : "true",
            onClick: () => selecionavel && onPickMonth({ year: activeYear, month: slot.month }),
            //> O mês fala pelo `data-tip` de todo o resto do painel: nó único em
            //> `fixed`, que se afasta da borda em vez de ser cortado pelo widget.
            "data-tip": textoDoMes(slot, activeYear, maxV, compare),
          },
            h(window.BS.PixelBars, { slot, maxV, isPicked, compare }),
            h("span", { className: "tl-mon", style: isCur && !isPicked ? { color: "var(--fg-1)", fontWeight: 700 } : null },
              PT_SHORT[slot.month]),
            h("span", { className: "tl-net", style: { color: !d ? "transparent" : net >= 0 ? "var(--pos)" : "var(--neg)" } },
              d ? (net >= 0 ? "+" : "−") + fmtCompact(net) : "·")
          );
        })
      ),
      sel && h("div", { style: { display: "flex", gap: 12, alignItems: "baseline", borderTop: "1px solid var(--line-1)", paddingTop: 7, flexShrink: 0, flexWrap: "wrap" } },
        h("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--fg-1)" } }, `${PT_SHORT[sel.month]}/${sel.year}`),
        h("span", { className: "mono", style: { fontSize: 11, color: "var(--pos)" } }, "+" + fmtBRL(sel.income)),
        h("span", { className: "mono", style: { fontSize: 11, color: "var(--neg)" } }, "−" + fmtBRL(sel.expenses)),
        (() => {
          const idx = monthly.indexOf(sel);
          const prev = idx > 0 ? monthly[idx - 1] : null;
          if (!prev) return null;
          const d = sel.expenses - prev.expenses;
          return h("span", { style: { marginLeft: "auto", fontSize: 10, color: "var(--fg-3)" } },
            "desp ",
            h("span", { className: "mono", style: { fontWeight: 700, color: d <= 0 ? "var(--pos)" : "var(--neg)" } },
              (d >= 0 ? "+" : "−") + fmtBRLCompact(d)),
            ` vs ${PT_SHORT[prev.month]}`);
        })()
      )
    )
  );
});

const AccountsWidget = React.memo(function AccountsWidget({ accounts, available, position, monthTx, monthSel,
                                                           filter, onToggleFacet, onManageAccounts }) {
  const grupos = window.BS.groupByBank(accounts, true);

  const gastoNoMes = _dMemo(() => {
    const m = new Map();
    (monthTx || []).forEach(t => {
      if (t.method !== "credit" || t.is_settlement) return;
      m.set(t.account_id, (m.get(t.account_id) || 0) + (t.flow === "expense" ? t.amount : -t.amount));
    });
    return m;
  }, [monthTx]);
  const checking = (accounts || []).filter(a => a.type === "checking");
  //> Três estados: fechado usa a posição do mês, corrente usa `available` (hoje),
  //> futuro não tem saldo — e repetir o de hoje ali seria imaginar.
  const futuro = !!position && position.is_future;
  const oculta = futuro || posicaoVelha(position);
  const total = oculta ? null
    : (position && !position.is_current) ? position.checking_total
    : (available ? available.checking_total : checking.reduce((s, a) => s + (a.balance || 0), 0));
  const colorOf = a => bankColor(a.bank, a.id);

  //> Fatia sobre o dinheiro que EXISTE, não sobre o líquido: conta negativa encolheria
  //> o total e as outras passariam de 100%. Dívida não é parcela do que você tem.
  const positiveTotal = checking.reduce((s, a) => s + Math.max(0, a.balance || 0), 0);
  const shareOf = a => ((a.balance || 0) > 0 && positiveTotal > 0
    ? ((a.balance || 0) / positiveTotal) * 100
    : null);

  const emAberto = (accounts || []).reduce((s, a) => s + (a.open_invoice ? a.open_invoice.total : 0), 0);

  const linhaConta = (a) => h("button", {
    key: a.id, onClick: () => onToggleFacet && onToggleFacet("accounts", a.id),
    className: (filter && filter.accounts.has(a.id)) ? "facet-row facet-active" : "facet-row",
    "data-tip": "Filtrar os lançamentos desta conta",
    style: { display: "flex", flexDirection: "column", gap: 1, padding: "5px 6px", textAlign: "left",
      cursor: "pointer", background: "none", border: "none", width: "100%" },
  },
    h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      h("span", { style: { width: 8, height: 8, background: colorOf(a), flexShrink: 0 } }),
      h("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.name),
      shareOf(a) != null && h("span", { className: "mono", style: { fontSize: 11, color: "var(--fg-3)", marginLeft: "auto" } }, `${shareOf(a).toFixed(0)}%`)
    ),
    //> `null` é ausência de medição, `0` é medição: "R$ 0,00" num mês futuro se lê
    //> como "a conta vai estar zerada", que é o que o ledger não sabe.
    h("span", { className: "mono", style: { fontSize: 14, fontWeight: 700, paddingLeft: 16, color: a.balance == null ? "var(--fg-faint)" : a.balance < 0 ? "var(--neg)" : "var(--fg-0)" } },
      a.balance == null ? "—" : fmtBRL(a.balance))
  );

  //> Fatura aberta manda (tem data pra sair); sem ela, o gasto do mês em tom neutro.
  const linhaCartao = (a) => {
    const fat = a.open_invoice;
    const gasto = gastoNoMes.get(a.id) || 0;
    return h("button", {
      key: a.id, onClick: () => onToggleFacet && onToggleFacet("accounts", a.id),
      className: (filter && filter.accounts.has(a.id)) ? "acct-card facet-active" : "acct-card",
      "data-tip": fat
        ? "Fatura ainda não paga — filtrar os lançamentos deste cartão"
        : "Filtrar os lançamentos deste cartão",
    },
      h("span", { className: "acct-card-tree" }, "└"),
      h("span", { style: { fontSize: 11, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.name),
      fat
        ? h(React.Fragment, null,
            h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--warn)" } },
              "−" + fmtBRL(Math.abs(fat.total))),
            h("span", { style: { fontSize: 10, color: "var(--fg-3)", flexShrink: 0 } },
              fat.due_date ? "a pagar · vence " + fmtDateBR(fat.due_date) : "a pagar"))
        : gasto !== 0
          ? h(React.Fragment, null,
              h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--fg-1)" } },
                (gasto >= 0 ? "−" : "+") + fmtBRL(Math.abs(gasto))),
              h("span", { style: { fontSize: 10, color: "var(--fg-3)", flexShrink: 0 } }, "no mês"))
          //> "sem uso no mês" num mês FUTURO afirmaria que você não vai usar o cartão
          //> em dezembro: ausência só vira fato depois que o mês aconteceu.
          : h("span", { style: { marginLeft: "auto", fontSize: 10, color: "var(--fg-3)" } },
              temFluxo(monthTx) ? "sem uso no mês" : "—"),
    );
  };

  return h("div", { className: "widget wg-4" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Contas"),
      h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: total == null ? "var(--fg-faint)" : "var(--fg-0)" },
        "data-tip": total == null ? window.BS.SEM_POSICAO : undefined },
        total == null ? "—" : fmtBRL(total)),
      h("button", { className: "px-btn px-btn--ghost px-btn--sm", "data-tip": "Gerenciar contas e cartões", onClick: onManageAccounts }, "⚙")
    ),
    h("div", { className: "widget-body", style: { gap: 10 } },
      positiveTotal > 0 && checking.length > 1 && h("div", { style: { display: "flex", gap: 3, height: 5, flexShrink: 0 } },
        checking.map(a => {
          const pct = shareOf(a);
          return pct != null && pct > 0.5 && h("div", { key: a.id, "data-tip": `${a.name}: ${pct.toFixed(0)}%`, style: { width: pct + "%", background: colorOf(a), opacity: 0.85 } });
        })
      ),
      h("div", { style: { display: "flex", flexDirection: "column" } },
        grupos.map((g, i) => h("div", {
          key: g.bank,
          style: { borderBottom: i < grupos.length - 1 ? "1px dashed var(--line-1)" : "none", paddingBottom: 3, marginBottom: 3 },
        },
          g.contas.map(linhaConta),
          g.cartoes.map(linhaCartao),
        ))
      ),
      emAberto > 0 && h("div", { style: { marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexShrink: 0, fontSize: 11 } },
        h("span", { style: { color: "var(--fg-3)" } }, "Faturas a pagar"),
        h("span", { className: "mono", style: { fontWeight: 700, color: "var(--warn)" } }, "−" + fmtBRL(emAberto))),
    )
  );
});

const CategoriesWidget = React.memo(function CategoriesWidget({ monthTx, uncatCount, onOpenBulk, filter,
                                                               onToggleFacet, catsIndex, monthSel, onBudgetSaved,
                                                               onManageCategories, position }) {
  const semFluxo = !temFluxo(monthTx);
  const expenses = monthTx.filter(isConsumptionExpense);
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const [editing, setEditing] = _dSt(null);

  const byCat = _dMemo(() => {
    const g = new Map();
    expenses.forEach(t => {
      const id = t.category_id ?? null;
      if (!g.has(id)) g.set(id, { id, name: t.category || "Sem categoria", total: 0 });
      g.get(id).total += t.amount;
    });
    return [...g.values()].sort((a, b) => b.total - a.total);
  }, [monthTx]);

  return h("div", { className: "widget wg-7" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Categorias"),
      //> "−R$ 0,00" em dezembro afirmaria que o mês não vai ter gasto nenhum.
      h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: semFluxo ? "var(--fg-faint)" : "var(--neg)" },
        "data-tip": semFluxo ? SEM_FLUXO : undefined },
        semFluxo ? "—" : "−" + fmtBRL(totalExp)),
      h("button", { className: "px-btn px-btn--ghost px-btn--sm", "data-tip": "Criar, renomear e apagar categorias", onClick: onManageCategories }, "⚙")
    ),
    h("div", { className: "widget-body", style: { gap: 8 } },
      byCat.length === 0
        ? h("div", { className: "px-empty" }, "Nenhuma despesa no mês.")
        : byCat.map((c) => h(CategoryRow, {
            key: c.id ?? "none", c, monthSel, onBudgetSaved,
            meta: c.id != null && catsIndex ? catsIndex.get(c.id) : null,
            active: filter.categories.has(c.name),
            onFacet: () => onToggleFacet("categories", c.name),
            editing: editing === c.id,
            onEdit: () => setEditing(c.id),
            onEditDone: () => setEditing(null),
          })),
      uncatCount > 0 && h("button", {
        onClick: onOpenBulk, className: "px-btn px-btn--ghost px-btn--sm",
        style: { marginTop: "auto", alignSelf: "flex-start", flexShrink: 0, color: "var(--accent)" }
      }, `Categorizar em lote · ${uncatCount}`)
    )
  );
});

function CategoryRow({ c, meta, active, onFacet, editing, onEdit, onEditDone, monthSel, onBudgetSaved }) {
  const budget = meta && meta.budget_cents != null ? meta.budget_cents / 100 : null;
  const st = window.BS.budgetState(c.total, budget);
  const [draft, setDraft] = _dSt("");

  const canBudget = c.id != null;

  const save = async () => {
    const reais = parseFloat(String(draft).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(reais) || reais < 0) { onEditDone(); return; }
    try {

      await putCategoryBudget(c.id, Math.round(reais * 100), refMonthOf(monthSel));
      onBudgetSaved && onBudgetSaved();
      window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: `Alvo de ${c.name}: ${fmtBRL(reais)}`, kind: "success" } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: "Erro ao gravar alvo", kind: "error" } }));
    }
    onEditDone();
  };

  return h("div", {
    className: active ? "facet-row facet-active" : "facet-row",
    style: { display: "flex", flexDirection: "column", gap: 3, flexShrink: 0, padding: "2px 0" },
  },
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 } },
      h("button", {
        onClick: onFacet, "data-tip": "Filtrar por esta categoria",
        style: { fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0,
          color: c.id == null ? "var(--fg-3)" : "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      }, c.name),
      h("span", { className: "mono", style: { fontSize: 11, fontWeight: 700, color: "var(--fg-0)", flexShrink: 0 } }, fmtBRL(c.total))
    ),

    st && h("div", { style: { position: "relative", height: 8, background: "var(--bg-2)", border: "1px solid var(--line-1)", overflow: "hidden" } },
      h("div", { style: { width: Math.min(100, st.ratio * 100) + "%", height: "100%", background: st.color, transition: "width 0.2s" } }),
      st.over && h("div", { className: "dither-neg", style: { position: "absolute", inset: 0, opacity: 0.35, pointerEvents: "none" } })),

    canBudget && h("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 11 } },
      editing
        ? h(React.Fragment, null,
            h("input", {
              autoFocus: true, defaultValue: budget != null ? String(budget).replace(".", ",") : "",
              onChange: e => setDraft(e.target.value),
              onKeyDown: e => { if (e.key === "Enter") save(); if (e.key === "Escape") onEditDone(); },
              onBlur: save, placeholder: "0,00", "aria-label": `Alvo de ${c.name}`,
              style: { width: 72, height: 22, fontSize: 11, padding: "0 5px", background: "var(--bg-0)",
                border: "1px solid var(--accent)", color: "var(--fg-0)", fontFamily: "var(--ff-mono)" },
            }),
            h("span", { style: { color: "var(--fg-3)" } },
              refMonthOf(monthSel) ? `alvo de ${window.BS.PT_MONTHS[monthSel.month].toLowerCase()}` : "alvo fixo")
          )
        : h("button", {
            onClick: onEdit,
            "data-tip": budget != null
              ? `Alvo ${meta.budget_source === "month" ? "só deste mês" : "fixo"}: ${fmtBRL(budget)} — clique pra mudar`
              : "Definir um alvo de gasto pra esta categoria",
            style: { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11,
              color: st ? st.color : "var(--fg-3)", fontWeight: st ? 700 : 400,
              borderBottom: "1px dashed var(--line-2)" },
          }, budget != null
              ? `${Math.round(st.ratio * 100)}% de ${fmtBRL(budget)}${meta.budget_source === "month" ? " · só este mês" : ""}`
              : "definir alvo")
    )
  );
}

const InvestmentsWidget = React.memo(function InvestmentsWidget({ investments, evolution, position, onOpenPosition }) {
  const semPosicao = !!position && (position.is_future || posicaoVelha(position));

  const typeLabel = t => INV_TYPE_LABEL[t] || (t ? t[0].toUpperCase() + t.slice(1) : "Investimento");
  const total = investments.reduce((s, i) => s + (i.balance || 0), 0);
  //> Δ do MÊS SELECIONADO: ler o fim da série dizia "vs o penúltimo mês dela", que
  //> em março é uma frase sobre junho. `delta_invested` já vem `null` sem medição.
  const invDelta = position ? position.delta_invested
    : ((evolution && evolution.length > 1)
        ? evolution[evolution.length - 1].cumulative - evolution[evolution.length - 2].cumulative : null);

  //> `group_name` agrega numa linha só. Quais são os grupos é decisão da config: nome
  //> cravado aqui deixaria quem usa outra config sem agrupamento nenhum.
  const rows = _dMemo(() => {
    const out = [];
    const grouped = new Map();
    investments.forEach(i => {
      if (!i.group_name) {
        out.push({ name: i.name, sub: typeLabel(i.type), balance: i.balance || 0,
                   derived: !!i.derived, ids: [i.id] });
        return;
      }
      const g = grouped.get(i.group_name) || { balance: 0, ids: [], types: new Set() };
      g.balance += i.balance || 0;
      g.ids.push(i.id);
      g.types.add(i.type);
      grouped.set(i.group_name, g);
    });
    grouped.forEach((g, name) => out.push({
      name: `${name}${g.ids.length > 1 ? ` ×${g.ids.length}` : ""}`,
      sub: [...g.types].map(typeLabel).join(" · "),
      balance: g.balance, ids: g.ids,
    }));
    return out.sort((a, b) => b.balance - a.balance);
  }, [investments]);

  return h("div", { className: "widget wg-7" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Investimentos"),
      h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: semPosicao ? "var(--fg-faint)" : "var(--reserve)" },
        "data-tip": semPosicao ? window.BS.SEM_POSICAO : undefined },
        semPosicao ? "—" : fmtBRL(total))
    ),
    h("div", { className: "widget-body", style: { gap: 0 } },
      semPosicao
        ? h("div", { className: "px-empty" },
            position.is_future
              ? "A carteira só existe até o mês corrente."
              : "Sem relatório de corretora neste mês — a última carteira conhecida é de outra data.")
        : investments.length === 0
        ? h("div", { className: "px-empty" }, "Nenhum investimento — importe um relatório B3.")
        : rows.map((r, i, arr) => h("button", {
            key: i,
            className: "facet-row",
            onClick: () => onOpenPosition && onOpenPosition(r.ids, r.name),
            "data-tip": `Ver histórico de ${r.name}`,
            style: { display: "flex", flexDirection: "column", gap: 1, padding: "7px 6px", borderBottom: i < arr.length - 1 ? "1px dashed var(--line-1)" : "none", flexShrink: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", width: "100%" }
          },
            h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" } },
              h("span", { "data-tip": r.name, style: { fontSize: 11, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name),
              h("span", { className: "mono", style: { fontSize: 12, fontWeight: 700, color: "var(--fg-0)", flexShrink: 0 } }, fmtBRL(r.balance))
            ),
            h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.04em" } },
              r.sub, total ? ` · ${((r.balance / total) * 100).toFixed(1)}%` : "",
              r.derived ? " · derivado" : "")
          )),
      invDelta != null && h("div", { style: { marginTop: "auto", paddingTop: 8, display: "flex", gap: 6, alignItems: "baseline", flexShrink: 0 } },
        h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" } }, "Δ mês"),
        h("span", { className: "kpi-delta", style: { color: invDelta >= 0 ? "var(--pos)" : "var(--info)" } },
          (invDelta >= 0 ? "+" : "−") + fmtBRL(Math.abs(invDelta))),
        invDelta < 0 && h("span", { style: { fontSize: 11, color: "var(--fg-3)" } }, "(resgate)"))
    )
  );
});

const refMonthOf = (monthSel) =>
  monthSel ? `${monthSel.year}-${String(monthSel.month).padStart(2, "0")}` : undefined;

function DashboardView({ monthSel, monthly, onPickMonth, refreshKey, onEditCategory, onImport, onManageCategories, onManageAccounts, onOpenPosition }) {
  const [available, setAvailable] = _dSt(null);
  const [commitments, setCommitments] = _dSt(null);
  const [availErr, setAvailErr] = _dSt(false);
  const [loadErr, setLoadErr] = _dSt(false);
  const [retryTick, setRetryTick] = _dSt(0);
  const [accounts, setAccounts] = _dSt([]);
  const [investments, setInvestments] = _dSt([]);
  const [liquidityHistory, setLiquidityHistory] = _dSt([]);
  const [evolution, setEvolution] = _dSt([]);
  const [cashflow, setCashflow] = _dSt(null);
  const [monthTx, setMonthTx] = _dSt([]);
  const [uncatCount, setUncatCount] = _dSt(0);
  const [bulkOpen, setBulkOpen] = _dSt(false);
  const [cmtOpen, setCmtOpen] = _dSt(false);
  const [position, setPosition] = _dSt(null);

  const [expenseCats, setExpenseCats] = _dSt([]);
  const [filter, setFilter] = _dSt(() => window.BS.emptyFilter());

  const onToggleFacet = (kind, value) => setFilter(f => window.BS.toggleFacet(f, kind, value));

  const setFilterField = (field, value) => setFilter(f => Object.assign({}, f, { [field]: value }));

  const clearFilter = () => setFilter(window.BS.emptyFilter());

  _dEf(() => { setFilter(window.BS.emptyFilter()); }, [monthSel]);

  _dEf(() => {
    setAvailErr(false); setLoadErr(false);
    fetchAvailable().then(setAvailable).catch(() => setAvailErr(true));
    Promise.all([fetchAccounts(), fetchInvestments(), fetchLiquidityHistory(), fetchInvestmentEvolution()])
      .then(([ac, invs, lh, ev]) => {
        setAccounts(ac); setInvestments(invs);
        setLiquidityHistory(lh || []); setEvolution(ev || []);
      }).catch(() => setLoadErr(true));
  }, [refreshKey, retryTick]);

  _dEf(() => {
    if (!monthSel) return;
    const { month, year } = monthSel;
    //> Posição acompanha o mês: sem isto, navegar pra março deixava três cartões
    //> e dois widgets falando de hoje enquanto o resto da tela falava de março.
    fetchPosition({ month, year }).then(setPosition).catch(() => setPosition(null));
    fetchCommitments({ month, year }).then(setCommitments).catch(() => {});
    fetchCashflowStatement({ month, year }).then(setCashflow).catch(() => {});
    fetchMonthTransactions({ month, year }).then(setMonthTx).catch(() => {});
    fetchUncategorizedMerchants({ year, month })
      .then(gs => setUncatCount(gs.reduce((s, g) => s + g.count, 0)))
      .catch(() => setUncatCount(0));
    fetchCategoriesFull("expense", refMonthOf(monthSel)).then(setExpenseCats).catch(() => setExpenseCats([]));
  }, [monthSel, refreshKey, retryTick]);

  _dEf(() => {
    const handler = e => setMonthTx(prev => prev.filter(tx => tx.id !== e.detail.id));
    window.addEventListener("bs-tx-optimistic-delete", handler);
    return () => window.removeEventListener("bs-tx-optimistic-delete", handler);
  }, []);

  const catsIndex = _dMemo(
    () => new Map(expenseCats.map(c => [c.id, c])),
    [expenseCats],
  );

  const reloadBudgets = _dCb(() => {
    if (!monthSel) return;
    fetchCategoriesFull("expense", refMonthOf(monthSel)).then(setExpenseCats).catch(() => {});
  }, [monthSel]);

  const isLatestMonth = _dMemo(() => {
    if (!monthSel || !monthly || !monthly.length) return false;
    const last = monthly[monthly.length - 1];
    return last.year === monthSel.year && last.month === monthSel.month;
  }, [monthly, monthSel]);

  if (loadErr) return h("div", { style: { margin: "48px auto", background: "var(--neg-bg)", border: "1px solid var(--neg)", padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", maxWidth: 480 } },
    h("div", { style: { color: "var(--neg)", fontSize: 14, fontWeight: 700 } }, "Falha ao carregar os dados."),
    h("div", { style: { color: "var(--fg-2)", fontSize: 13 } }, "O servidor local não respondeu. Verifique se o BrokerShark está rodando."),
    h("button", { className: "px-btn px-btn--danger", onClick: () => setRetryTick(t => t + 1) }, "Tentar de novo"));

  const isFirstRun = available && available.checking_total === 0 && monthly.length === 0;
  if (isFirstRun) return h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 } },
    h("div", { className: "fade-in", style: { padding: "56px 40px", width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 24, alignItems: "center", textAlign: "center", background: "var(--bg-1)", border: "1px solid var(--line-1)" } },
      h("div", { style: { display: "flex", justifyContent: "center", alignItems: "center", width: 64, height: 64, background: "var(--bg-2)", color: "var(--accent)", border: "1px solid var(--accent)" } },
        h("svg", { width: 32, height: 32, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
          h("path", { d: "M8 11 L8 2" }), h("path", { d: "M4 6 L8 2 L12 6" }), h("path", { d: "M2 14 L14 14" })
        )
      ),
      h("h1", { style: { fontFamily: "var(--ff-sans)", fontSize: 22, color: "var(--fg-0)", letterSpacing: "1px", textTransform: "uppercase", margin: 0, lineHeight: 1.3 } }, "Você no controle"),
      h("p", { style: { fontSize: 14, color: "var(--fg-2)", lineHeight: 1.6, maxWidth: 420, margin: 0 } },
        "Importe seus extratos (.csv) ou relatórios da B3 (.xlsx) para começar a responder à pergunta que importa: ",
        h("strong", { style: { color: "var(--fg-0)", fontWeight: 700 } }, "Quanto posso gastar agora?")
      ),
      h("button", { className: "px-btn px-btn--primary", style: { height: 34, marginTop: 8 }, onClick: onImport },
        h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
          h("path", { d: "M8 11 L8 2" }), h("path", { d: "M4 6 L8 2 L12 6" }), h("path", { d: "M2 14 L14 14" })
        ),
        "Importar meus arquivos"
      )
    )
  );

  const investTotal = investments.reduce((s, i) => s + (i.balance || 0), 0);

  //> Num mês fechado, contas e carteira mostram a POSIÇÃO DAQUELE MÊS: o saldo vem
  //> de `/api/position`, o cadastro (cor, tipo, nome) segue de `/api/accounts`.
  const passado = !!position && !position.is_current && !position.is_future;
  //> Futuro OU mês sem import: nos dois o saldo mostrado seria de outra data.
  const semPosicao = !!position && (position.is_future || posicaoVelha(position));

  const kpiAccounts = _dMemo(() => {
    if (semPosicao) {
      return accounts.map(a => ({ ...a, balance: null, open_invoice: null }));
    }
    if (!passado) return accounts;
    const saldo = new Map(position.accounts.map(a => [a.id, a.balance]));
    //> `open_invoice` é sempre "agora": não existe fatura em aberto de um mês
    //> fechado, e arrastá-la pra trás faria o cartão dever duas vezes.
    return accounts.map(a => ({ ...a, balance: saldo.get(a.id) ?? 0, open_invoice: null }));
  }, [passado, semPosicao, accounts, position]);

  const viewInvestments = passado ? position.investments : investments;

  return h(React.Fragment, null,
    h(KpiStrip, { available, availErr, accounts: kpiAccounts, cashflow, investTotal, position, monthSel, monthTx }),
    h("div", { className: "dash-main fade-in" },
      h("div", { className: "widget-band" },
        h("div", { className: "widget-row" },
          h(GeneralWidget, { cashflow, liquidityHistory, monthSel, position, monthTx, uncatCount,
            onOpenBulk: () => setBulkOpen(true), commitments,
            onOpenCommitments: () => setCmtOpen(true) }),
          h(TimelineWidget, { monthly, monthSel, onPickMonth }),
          h(AccountsWidget, { accounts: kpiAccounts, available, position, monthTx, monthSel, filter, onToggleFacet, onManageAccounts }),
          h(CategoriesWidget, { monthTx, uncatCount, onOpenBulk: () => setBulkOpen(true), filter, onToggleFacet,
            catsIndex, monthSel, onBudgetSaved: reloadBudgets, onManageCategories, position }),
          h(InvestmentsWidget, { investments: viewInvestments, evolution, position, monthSel, onOpenPosition }),
        ),
      ),
      cmtOpen && h(window.BS.CommitmentsPanel, {
        commitments, monthSel, monthTx, onEditCategory,
        onClose: () => setCmtOpen(false),
      }),
      h(window.BS.FilterBar, { filter, onRemove: (kind, value) => {
          if (kind === "flow" || kind === "method") setFilterField(kind, "all");
          else onToggleFacet(kind, value);
        }, onClear: clearFilter }),
      h(window.BS.TxTableWidget, {
        monthSel, refreshKey, onEditCategory,
        openBulk: bulkOpen, onBulkConsumed: () => setBulkOpen(false),
        monthTx, setMonthTx,
        filter, setFilterField, onToggleFacet,

        accounts, catsIndex, isLatestMonth,
      })
    )
  );
}

window.BS = window.BS || {};
window.BS.DashboardView = DashboardView;

})();
