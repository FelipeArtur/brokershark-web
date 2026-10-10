(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _dSt, useEffect: _dEf, useMemo: _dMemo, useCallback: _dCb } = React;
const { fmtBRL, fmtBRLCompact, fmtCompact, fmtDateBR, PT_MONTHS, PT_SHORT,
        isConsumptionExpense, isRevenue, bankColor, bankShortLabel, fullDateBR } = window.BS;

window.BS = window.BS || {};
const SEM_FLUXO = "Nenhum lançamento neste mês. Zero seria uma afirmação de que "
  + "nada entrou nem saiu; o que há é ausência de dados. importe o extrato do mês.";

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
 *          um saldo de hoje que ninguém mediu. a mesma extrapolação que o mês
 *          futuro fazia, só que com nome de fato.
 */
const posicaoVelha = (position) =>
  !!position && !position.is_future && !position.has_data;

const SEM_POSICAO = window.BS.SEM_POSICAO = "Mês futuro não tem saldo. o ledger só sabe o que já aconteceu. "
  + "O que se conhece daqui para a frente são os compromissos, no quadro Comprometido.";

const INV_TYPE_LABEL = {
  rdb: "Reserva (RDB)", cdb: "CDB / Renda fixa", tesouro: "Tesouro Direto",
  lci: "LCI / Renda fixa", lca: "LCA / Renda fixa", savings: "Poupança",
};

function Delta({ value, suffix = "em relação ao mês anterior", invert = false }) {
  if (value == null) return null;
  const good = invert ? value <= 0 : value >= 0;
  return h(React.Fragment, null,
    h("span", { className: "kpi-delta", style: { color: good ? "var(--pos)" : "var(--neg)" } },
      (value >= 0 ? "+" : "−") + fmtBRL(Math.abs(value))),
    h("span", { style: { color: "var(--fg-3)" } }, suffix)
  );
}

/**
 * @brief   A faixa de KPIs. posição no topo, resultado do mês no meio.
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
  //> saldo nenhum. o de hoje ali seria imaginar quanto você vai ter em dezembro.
  const passado = !!position && !position.is_current && !position.is_future;
  const futuro = !!position && position.is_future;
  //> Sem lançamento no mês, o número existe mas é de outra data: vira nota, não título.
  const velha = posicaoVelha(position);
  const oculta = futuro || velha;

  const checkingTotal = oculta ? null : passado ? position.checking_total : (available ? available.checking_total : 0);
  const savingsTotal = oculta ? null : passado ? (position.savings_total ?? null) : (available?.savings_total ?? null);
  const investido = oculta ? null : passado ? position.invested_total : investTotal;
  const patrimonio = oculta ? null : passado ? position.net_worth : checkingTotal + investido;

  //> `/api/position` já devolve `null` quando o mês ou o anterior não tem medição
  //>. futuro incluso. Repetir a condição aqui daria dois lugares para divergir.
  const patDelta = position ? position.delta_net_worth : null;
  const invDelta = position ? position.delta_invested : null;

  const mesNome = monthSel ? PT_MONTHS[monthSel.month].toLowerCase() : "";
  const vsMes = monthSel
    ? "em relação a " + PT_SHORT[monthSel.month === 1 ? 12 : monthSel.month - 1]
    : "em relação ao mês anterior";

  const committed = (!passado && !oculta && available && available.committed_this_month) ? available.committed_this_month : 0;
  const availValue = oculta ? null : passado ? (position.available_total ?? checkingTotal) : (available ? available.available_net : null);
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
        ? h("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--neg)" } }, "Falha ao carregar")
        : availValue == null
          ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_POSICAO }, "—")
          : h("span", {
              className: "kpi-value",
              style: { color: availNeg ? "var(--neg)" : "var(--fg-0)" },
              "data-tip": passado
                ? `Contas: ${fmtBRL(checkingTotal)}${savingsTotal == null ? "" : " + Reserva de emergência: " + fmtBRL(savingsTotal)}`
                : `Contas: ${fmtBRL(checkingTotal)}${savingsTotal == null ? "" : " + Reserva de emergência: " + fmtBRL(savingsTotal)}${committed > 0 ? " − Comprometido: " + fmtBRL(committed) : ""} = ${fmtBRL(availValue)}`,
            },
              (availNeg ? "−" : "") + fmtBRL(Math.abs(availValue))),
      h("span", { className: "kpi-sub" },
        futuro
          ? h("span", { style: { color: "var(--fg-3)" } }, "O saldo só existe até o mês corrente.")
          : velha
          ? h("span", { style: { color: "var(--fg-3)", lineHeight: 1.5 } },
              `Último saldo conhecido: ${fmtBRL(position.checking_total)}, de ${fullDateBR(position.as_of)}.`)
          : h(React.Fragment, null,
              checking.map(a => h("span", { key: a.id, style: { display: "inline-flex", gap: 5, alignItems: "baseline" } },
                h("span", { style: { color: bankColor(a.bank, a.id), fontWeight: 700 } }, bankShortLabel(a.bank, a.id)),
                h("span", { className: "mono", style: { color: "var(--fg-1)", fontSize: 11 } }, fmtBRL(a.balance || 0))
              )),
              savingsTotal > 0 && h("span", {
                style: { display: "inline-flex", gap: 5, alignItems: "baseline" },
                "data-tip": "Reserva de emergência com liquidez imediata D+0 (Caixinhas / RDB)"
              },
                h("span", { style: { color: "var(--reserve)", fontWeight: 700 } }, "Reserva de emergência"),
                h("span", { className: "mono", style: { color: "var(--fg-1)", fontSize: 11 } }, fmtBRL(savingsTotal))
              ),
              committed > 0 && h("span", {
                className: "mono",
                style: { color: "var(--warn)", fontSize: 11, marginTop: 2, display: "block" },
                "data-tip": [
                  available.committed_invoices > 0 && `Fatura: ${fmtBRL(available.committed_invoices)}`,
                  available.committed_recurring > 0 && `Recorrente: ${fmtBRL(available.committed_recurring)}`,
                  available.committed_installments > 0 && `Parcela prevista: ${fmtBRL(available.committed_installments)}`,
                ].filter(Boolean).join(" · "),
              }, "− Comprometido este mês: " + fmtBRL(committed))
            )
      ),
    ),

    h("div", { className: "kpi" },
      h("span", { className: "kpi-label" },
        futuro ? `Patrimônio em ${mesNome}`
          : velha ? "Patrimônio (sem dados)"
          : passado ? `Patrimônio no fim de ${mesNome}` : "Patrimônio Consolidado"),
      patrimonio == null
        ? h("span", { className: "kpi-value kpi-vazio", "data-tip": SEM_POSICAO }, "—")
        : h("span", { className: "kpi-value", "data-tip": `Caixa: ${fmtBRL(checkingTotal)} + Investimentos: ${fmtBRL(investido)}` },
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
        !semFluxo && invNet !== 0 && h("span", { className: "mono", style: { color: invNet > 0 ? "var(--reserve)" : "var(--info)" }, "data-tip": invNet > 0 ? "Aplicação líquida no mês" : "Resgate líquido no mês" },
          (invNet > 0 ? "→ Aplicado " : "← Resgatado ") + fmtBRL(Math.abs(invNet))),
        semFluxo && h("span", { style: { color: "var(--fg-3)" } },
          futuro ? "Mês ainda não aconteceu." : "Cobertura de importação incompleta.")
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
  const monName = monthSel ? PT_MONTHS[monthSel.month] : "";

  const parts = [];
  //> Fluxo medido só existe depois que o mês aconteceu: no futuro o resumo mostra
  //> só o comprometido, porque zerar entradas e saídas seria prever que nada vem.
  if (!semFluxo) parts.push(h("div", { key: "i", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Receitas (entradas)"),
    h("b", { className: "mono", style: { color: "var(--pos)", fontSize: 13 } }, "+" + fmtBRL(inc))
  ));
  if (!semFluxo) parts.push(h("div", { key: "e", style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 } },
    h("span", { style: { color: "var(--fg-2)" } }, "Despesas (saídas)"),
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
    className: "resumo-btn",
    "data-tip": comprometido > 0
      ? "Parcelas e recorrentes que ainda vão sair neste mês. clique para ver a lista."
      : "Nada comprometido neste mês. clique para ver como parcelas e recorrentes aparecem.",
  },
    h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 } },
      h("span", { style: { color: "var(--fg-1)" } }, "Comprometido"),
      h("span", { style: { color: "var(--accent)", fontSize: 11 } }, "→")
    ),
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

  return h("div", { className: "widget wg-5" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Visão Geral do Mês"),
      patDelta != null && h("span", { style: { marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "baseline" } },
        h("span", { className: "kpi-delta", style: { color: patDelta >= 0 ? "var(--pos)" : "var(--neg)" } },
          (patDelta >= 0 ? "+" : "−") + fmtBRLCompact(patDelta)),
        h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" } }, "evolução patrimonial"))
    ),
    h("div", { className: "widget-body", style: { gap: 16 } },

      h("div", { style: { fontSize: 12, lineHeight: 1.4, color: "var(--fg-1)" } },
        h("div", { style: { color: "var(--fg-0)", fontWeight: 700, marginBottom: 8 } }, `Resumo de ${monName}`),
        semFluxo && h("div", { style: { color: "var(--fg-3)", marginBottom: 6, lineHeight: 1.5 } },
          futuro ? "Mês ainda não aconteceu." : "Cobertura de importação incompleta."),
        ...parts
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
function textoDoMes(slot, year, maxV) {
  const d = slot.data;
  const cabeca = `${PT_MONTHS[slot.month]} de ${year}`;
  const committed = d && d.committed ? d.committed : 0;
  const hasRealized = d && d.has_data;

  if (!hasRealized && committed === 0) {
    return `${cabeca}\n${slot.porVir ? "Ainda não aconteceu. sem compromissos previstos." : "Cobertura de importação incompleta."}`;
  }

  // Mês futuro ou sem lançamentos, mas com compromissos previstos:
  if (!hasRealized && committed > 0) {
    const lines = [`${cabeca} (Previsto)`, "─".repeat(28)];
    lines.push(`Comprometido: −${fmtBRL(committed)}`);
    if (d.committedInvoices > 0) lines.push(`  • Faturas:     ${fmtBRL(d.committedInvoices)}`);
    if (d.committedInstallments > 0) lines.push(`  • Parcelas:    ${fmtBRL(d.committedInstallments)}`);
    if (d.committedRecurring > 0) lines.push(`  • Recorrentes: ${fmtBRL(d.committedRecurring)}`);
    return lines.join("\n");
  }

  const specs = window.BS.barSpecs(slot, maxV, true);
  //> Seta separada do número: "▲" numa despesa não é a notícia que é numa receita,
  //> e o balão não tem cor pra dizer qual é. Sem "R$": a coluna ao lado já o diz.
  const variacao = (dl) => {
    if (dl == null) return null;
    return dl === 0 ? { seta: "=", num: "estável" }
                    : { seta: dl > 0 ? "▲" : "▼", num: fmtCompact(Math.abs(dl)) };
  };

  const net = d.income - d.expenses;
  const prevData = slot.prev ? slot.prev.data : null;
  const dlIncome = (specs.find(s => s.kind === "income") || {}).delta ?? null;
  const dlExpense = (specs.find(s => s.kind === "expense") || {}).delta ?? null;
  const dlNet = prevData ? net - (prevData.income - prevData.expenses) : null;

  const vars = [variacao(dlIncome), variacao(dlExpense), variacao(dlNet)];
  const hasAnyVar = vars.some(Boolean);
  const maxVarLen = hasAnyVar ? Math.max(...vars.map(v => (v ? v.num.length : 0))) : 0;

  //> Alinhamento preciso: R$ e vírgula decimal na mesma coluna vertical em todas as linhas.
  const numFmt = v => Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawNums = [numFmt(d.income), numFmt(d.expenses), numFmt(net)];
  const maxNumLen = Math.max(...rawNums.map(n => n.length));

  const formatVal = (sign, numStr) => `${sign}R$ ${numStr.padStart(maxNumLen)}`;
  const formatRow = (rot, sign, numStr, v) => {
    let row = `${rot.padEnd(10)} ${formatVal(sign, numStr)}`;
    if (hasAnyVar) {
      row += v ? `  ${v.seta} ${v.num.padStart(maxVarLen)}` : `    ${"".padStart(maxVarLen)}`;
    }
    return row;
  };

  const rowInc = formatRow("Receitas", " ", rawNums[0], vars[0]);
  const rowExp = formatRow("Despesas", " ", rawNums[1], vars[1]);
  const rowNet = formatRow("Resultado", net >= 0 ? "+" : "−", rawNums[2], vars[2]);

  const maxLen = Math.max(rowInc.length, rowExp.length, rowNet.length);
  const divider = "─".repeat(maxLen);

  let out = `${cabeca}\n${divider}\n${rowInc}\n${rowExp}\n${divider}\n${rowNet}`;
  if (committed > 0) {
    const sobra = net - committed;
    out += `\n${divider}\nComprometido: −${fmtBRL(committed)}\nSobra proj.:  ${sobra >= 0 ? "+" : "−"}${fmtBRL(Math.abs(sobra))}`;
  }

  //> O ano entra quando a referência é de outro: comparar janeiro com "dezembro"
  //> sem dizer de qual ano deixa a conta no ar.
  const ref = (slot.prev && prevData)
    ? `\n\nEm relação a ${PT_MONTHS[slot.prev.month]}`
      + (slot.prev.year !== year ? ` de ${slot.prev.year}` : "")
    : "";

  return `${out}${ref}`;
}

const TimelineWidget = React.memo(function TimelineWidget({ monthly, monthSel, onPickMonth }) {
  const now = new Date();
  const [browsingYear, setBrowsingYear] = _dSt(null);
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
    const navMes = nav.find(x => x.year === activeYear && x.month === m);
    const hasRealized = data && data.has_data;
    const isFuture = (!hasRealized) && !!navMes;
    slots.push({ month: m, data, prev, futuro: isFuture, porVir: !!navMes && !!navMes.future });
  }
  const maxV = Math.max(...slots.map(s => s.data ? Math.max(s.data.income || 0, s.data.expenses || 0, s.data.committed || 0) : 0), 1);

  return h("div", { className: "widget wg-7" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Fluxo Mês a Mês"),
      h("span", { style: { marginLeft: "auto", display: "flex", gap: 10, fontSize: 11, color: "var(--fg-3)", alignItems: "center" } },
        h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 }, "data-tip": "Receitas mensais realizadas." },
          h("svg", { width: 14, height: 8, viewBox: "0 0 14 8", style: { verticalAlign: "middle" } },
            h("line", { x1: 0, y1: 4, x2: 14, y2: 4, stroke: "var(--pos)", strokeWidth: 2 }),
            h("circle", { cx: 7, cy: 4, r: 2.5, fill: "var(--pos)" })
          ),
          "Receitas"
        ),
        h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 }, "data-tip": "Despesas mensais realizadas." },
          h("svg", { width: 14, height: 8, viewBox: "0 0 14 8", style: { verticalAlign: "middle" } },
            h("line", { x1: 0, y1: 4, x2: 14, y2: 4, stroke: "var(--neg)", strokeWidth: 2 }),
            h("circle", { cx: 7, cy: 4, r: 2.5, fill: "var(--neg)" })
          ),
          "Despesas"
        ),
        h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 }, "data-tip": "Despesas previstas de acordo com valores comprometidos (faturas, parcelas e recorrentes)." },
          h("svg", { width: 16, height: 8, viewBox: "0 0 16 8", style: { verticalAlign: "middle" } },
            h("line", { x1: 0, y1: 4, x2: 16, y2: 4, stroke: "var(--warn)", strokeWidth: 2, strokeDasharray: "3,3" }),
            h("circle", { cx: 8, cy: 4, r: 2.5, fill: "var(--bg-0)", stroke: "var(--warn)", strokeWidth: 1.5 })
          ),
          "Previsto"
        )
      )
    ),
    h("div", { className: "widget-body", style: { gap: 6, padding: "8px 14px", overflow: "hidden" } },
      h("div", { className: "tl-year-bar" },
        years.map(y => h("button", {
          key: y, onClick: () => setBrowsingYear(y),
          className: `tl-year-btn${activeYear === y ? " active" : ""}`,
          "data-tip": `Ver meses de ${y}`,
          "aria-label": `Ano ${y}`,
        }, y))
      ),
      h("div", {
        className: "tl-slots-container",
      },
        h(window.BS.TimelineLineChart, { slots, maxV, monthSel, activeYear, onPickMonth, textoDoMes }),
        h("div", { className: "tl-months-bar" },
          slots.map((slot) => {
            const d = slot.data;
            const isPicked = d && monthSel && d.year === monthSel.year && d.month === monthSel.month;
            const isCur = activeYear === now.getFullYear() && slot.month === now.getMonth() + 1;
            const hasRealized = d && d.has_data;
            const net = hasRealized ? d.income - d.expenses : 0;
            const committed = d && d.committed ? d.committed : 0;

            const selecionavel = d || slot.futuro;
            const marcado = isPicked
              || (slot.futuro && monthSel && monthSel.year === activeYear && monthSel.month === slot.month);

            let netLabel = "·";
            let netColor = "var(--fg-faint)";

            if (hasRealized) {
              netLabel = (net >= 0 ? "+" : "−") + fmtCompact(Math.abs(net));
              netColor = isPicked ? "var(--accent-fg)" : (net >= 0 ? "var(--pos)" : "var(--neg)");
            } else if (committed > 0) {
              netLabel = "−" + fmtCompact(committed);
              netColor = isPicked ? "var(--accent-fg)" : "var(--warn)";
            }

            return h("button", {
              key: slot.month,
              className: `tl-month-btn${marcado ? " picked" : ""}${hasRealized ? "" : (committed > 0 ? " tl-month-btn--forecast" : " tl-month-btn--empty")}${slot.futuro ? " tl-month-btn--futuro" : ""}`,
              "aria-disabled": selecionavel ? undefined : "true",
              onClick: () => selecionavel && onPickMonth({ year: activeYear, month: slot.month }),
              "data-tip": textoDoMes(slot, activeYear, maxV),
            },
              h("span", { className: "tl-mon", style: isCur && !isPicked ? { color: "var(--fg-1)", fontWeight: 700 } : null },
                PT_SHORT[slot.month]),
              h("span", {
                className: "tl-net",
                style: {
                  color: netColor,
                  fontWeight: (hasRealized || committed > 0) ? 700 : 500,
                  fontStyle: (!hasRealized && committed > 0) ? "italic" : "normal",
                }
              }, netLabel)
            );
          })
        )
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
  //> futuro não tem saldo. e repetir o de hoje ali seria imaginar.
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

  const emAberto = (accounts || []).reduce((s, a) => {
    if (!a.open_invoice) return s;
    if (a.open_invoice.paid) return s;
    return s + a.open_invoice.total;
  }, 0);

  const linhaConta = (a) => h("button", {
    key: a.id, onClick: () => onToggleFacet && onToggleFacet("accounts", a.id),
    className: (filter && filter.accounts.has(a.id)) ? "acct-row-btn active" : "acct-row-btn",
    "data-tip": `Filtrar lançamentos da conta ${a.name}.`,
  },
    h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      h("span", { style: { width: 8, height: 8, background: colorOf(a), flexShrink: 0 } }),
      h("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.name),
      shareOf(a) != null && h("span", { className: "mono", style: { fontSize: 11, color: "var(--fg-3)", marginLeft: "auto" } }, `${shareOf(a).toFixed(0)}%`)
    ),
    //> `null` é ausência de medição, `0` é medição: "R$ 0,00" num mês futuro se lê
    //> como "a conta vai estar zerada", que é o que o ledger não sabe.
    h("span", { className: "mono", style: { fontSize: 13, fontWeight: 700, paddingLeft: 16, color: a.balance == null ? "var(--fg-faint)" : a.balance < 0 ? "var(--neg)" : "var(--fg-0)" } },
      a.balance == null ? "—" : fmtBRL(a.balance))
  );

  //> Fatura do mês: paga mostra em tom neutro, a pagar mostra em alerta; sem fatura, gasto do mês.
  const linhaCartao = (a) => {
    const fat = a.open_invoice;
    const gasto = gastoNoMes.get(a.id) || 0;
    const isPaid = fat && fat.paid;
    return h("button", {
      key: a.id, onClick: () => onToggleFacet && onToggleFacet("accounts", a.id),
      className: (filter && filter.accounts.has(a.id)) ? "acct-row-btn active" : "acct-row-btn",
      "data-tip": fat
        ? (isPaid
          ? `Fatura paga em ${fmtDateBR(fat.payment_date)}`
          : (fat.due_date ? `Fatura aberta: vence em ${fmtDateBR(fat.due_date)}` : "Fatura em aberto"))
        : `Filtrar lançamentos do cartão ${a.name}.`,
    },
      h("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        h("span", { className: "acct-card-tree" }, "└"),
        h("span", { style: { fontSize: 11, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.name),
        fat
          ? h(React.Fragment, null,
              h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: isPaid ? "var(--fg-2)" : "var(--warn)" } },
                "−" + fmtBRL(Math.abs(fat.total))),
              h("span", { style: { fontSize: 10, color: isPaid ? "var(--fg-3)" : "var(--fg-3)", flexShrink: 0 } },
                isPaid
                  ? "Paga" + (fat.payment_date ? " · " + fmtDateBR(fat.payment_date) : "")
                  : (fat.due_date ? "A pagar · Vence " + fmtDateBR(fat.due_date) : "A pagar")))
          : gasto !== 0
            ? h(React.Fragment, null,
                h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--fg-1)" } },
                  (gasto >= 0 ? "−" : "+") + fmtBRL(Math.abs(gasto))),
                h("span", { style: { fontSize: 10, color: "var(--fg-3)", flexShrink: 0 } }, "No mês"))
            : h("span", { style: { marginLeft: "auto", fontSize: 10, color: "var(--fg-3)" } },
                temFluxo(monthTx) ? "Sem uso no mês" : "—")
      )
    );
  };

  return h("div", { className: "widget wg-4" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Contas e Cartões"),
      h("span", { className: "mono", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: total == null ? "var(--fg-faint)" : "var(--fg-0)" },
        "data-tip": total == null ? window.BS.SEM_POSICAO : undefined },
        total == null ? "—" : fmtBRL(total)),
      h("button", { className: "widget-icon-btn", "data-tip": "Gerenciar contas e cartões", "aria-label": "Gerenciar contas e cartões", onClick: onManageAccounts },
        h(window.BS.IconGear, { size: 12 }))
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
                                                               onManageCategories, position, uncatGroups = [] }) {
  const semFluxo = !temFluxo(monthTx);
  const [activeFlow, setActiveFlow] = _dSt("expense");
  const [editing, setEditing] = _dSt(null);

  const expenses = monthTx.filter(isConsumptionExpense);
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);

  const incomes = monthTx.filter(isRevenue);
  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);

  const byCatExp = _dMemo(() => {
    const g = new Map();
    expenses.forEach(t => {
      const id = t.category_id ?? null;
      if (!g.has(id)) g.set(id, { id, name: t.category || "Sem categoria", total: 0, flow: "expense" });
      g.get(id).total += t.amount;
    });
    return [...g.values()].sort((a, b) => b.total - a.total);
  }, [expenses]);

  const byCatInc = _dMemo(() => {
    const g = new Map();
    incomes.forEach(t => {
      const id = t.category_id ?? null;
      if (!g.has(id)) g.set(id, { id, name: t.category || "Sem categoria", total: 0, flow: "income" });
      g.get(id).total += t.amount;
    });
    return [...g.values()].sort((a, b) => b.total - a.total);
  }, [incomes]);

  const isExp = activeFlow === "expense";
  const currentCats = isExp ? byCatExp : byCatInc;
  const currentTotal = isExp ? totalExp : totalInc;

  const uncatExpCount = _dMemo(() =>
    (uncatGroups || []).filter(g => g.flow === "expense").reduce((s, g) => s + g.count, 0),
    [uncatGroups]
  );
  const uncatIncCount = _dMemo(() =>
    (uncatGroups || []).filter(g => g.flow === "income").reduce((s, g) => s + g.count, 0),
    [uncatGroups]
  );

  const activeUncatCount = isExp ? uncatExpCount : uncatIncCount;

  return h("div", { className: "widget wg-4" },
    h("div", { className: "widget-h" },
      h("span", { className: "widget-title" }, "Categorias"),
      //> "−R$ 0,00" em dezembro afirmaria que o mês não vai ter gasto nenhum.
      h("span", {
        className: "mono",
        style: {
          marginLeft: "auto", fontSize: 12, fontWeight: 700,
          color: semFluxo ? "var(--fg-faint)" : (isExp ? "var(--neg)" : "var(--pos)")
        },
        "data-tip": semFluxo ? SEM_FLUXO : undefined
      },
        semFluxo ? "—" : ((isExp ? "−" : "+") + fmtBRL(currentTotal))),
      h("button", { className: "widget-icon-btn", "data-tip": "Gerenciar categorias", "aria-label": "Gerenciar categorias", onClick: onManageCategories },
        h(window.BS.IconGear, { size: 12 }))
    ),
    h("div", { className: "widget-body", style: { gap: 8 } },
      h(window.BS.SegmentControl, {
        options: [
          { value: "expense", label: uncatExpCount > 0 ? `Gastos (${uncatExpCount})` : "Gastos" },
          { value: "income", label: uncatIncCount > 0 ? `Entradas (${uncatIncCount})` : "Entradas" },
        ],
        value: activeFlow,
        onChange: setActiveFlow,
        columns: 2,
        fill: true,
      }),
      currentCats.length === 0
        ? h("div", { className: "px-empty" }, isExp ? "Nenhum gasto no mês." : "Nenhuma entrada no mês.")
        : currentCats.map((c) => h(CategoryRow, {
            key: `${activeFlow}-${c.id ?? "none"}`, c, monthSel, onBudgetSaved,
            meta: c.id != null && catsIndex ? catsIndex.get(c.id) : null,
            active: filter.categories.has(c.name),
            onFacet: () => onToggleFacet("categories", c.name),
            editing: editing === c.id,
            onEdit: () => setEditing(c.id),
            onEditDone: () => setEditing(null),
            flow: activeFlow,
            totalFlow: currentTotal,
          })),
      activeUncatCount > 0 && h("button", {
        onClick: () => onOpenBulk && onOpenBulk(activeFlow),
        className: "px-btn px-btn--primary px-btn--sm",
        style: { marginTop: "auto", alignSelf: "flex-start", flexShrink: 0 }
      }, `Categorizar ${isExp ? "gastos" : "entradas"} em lote · ${activeUncatCount}`)
    )
  );
});

function CategoryRow({ c, meta, active, onFacet, editing, onEdit, onEditDone, monthSel, onBudgetSaved, flow = "expense", totalFlow = 0 }) {
  const isIncome = flow === "income";
  const budget = !isIncome && meta && meta.budget_cents != null ? meta.budget_cents / 100 : null;
  const st = !isIncome ? window.BS.budgetState(c.total, budget) : null;
  const [draft, setDraft] = _dSt("");

  const canBudget = !isIncome && c.id != null;
  const share = totalFlow > 0 ? (c.total / totalFlow) : 0;

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
    className: active ? "cat-row-btn active" : "cat-row-btn",
    onClick: (e) => {
      if (e.target.tagName !== "BUTTON" && e.target.tagName !== "INPUT") {
        onFacet();
      }
    },
    "data-tip": `Filtrar lançamentos da categoria ${c.name}.`,
  },
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 } },
      h("button", {
        onClick: (e) => { e.stopPropagation(); onFacet(); },
        className: "cat-name-btn",
        style: { color: c.id == null ? "var(--fg-3)" : undefined },
      }, c.name),
      h("span", {
        className: "mono",
        style: { fontSize: 11, fontWeight: 700, color: isIncome ? "var(--pos)" : "var(--fg-0)", flexShrink: 0 }
      }, (isIncome ? "+" : "") + fmtBRL(c.total))
    ),

    !isIncome && st && h("div", { style: { position: "relative", height: 6, background: "var(--bg-2)", border: "1px solid var(--line-1)", overflow: "hidden", marginTop: 2, marginBottom: 2 } },
      h("div", { style: { width: Math.min(100, st.ratio * 100) + "%", height: "100%", background: st.color, transition: "width 0.2s" } }),
      st.over && h("div", { className: "dither-neg", style: { position: "absolute", inset: 0, opacity: 0.35, pointerEvents: "none" } })),

    isIncome && totalFlow > 0 && h("div", { style: { position: "relative", height: 6, background: "var(--bg-2)", border: "1px solid var(--line-1)", overflow: "hidden", marginTop: 2, marginBottom: 2 } },
      h("div", { style: { width: Math.min(100, share * 100) + "%", height: "100%", background: "var(--pos)", transition: "width 0.2s" } })
    ),

    !isIncome && canBudget && h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 } },
      editing
        ? h(React.Fragment, null,
            h("input", {
              autoFocus: true, defaultValue: budget != null ? String(budget).replace(".", ",") : "",
              onChange: e => setDraft(e.target.value),
              onKeyDown: e => { if (e.key === "Enter") save(); if (e.key === "Escape") onEditDone(); },
              onBlur: save, placeholder: "0,00", "aria-label": `Alvo de ${c.name}`,
              style: { width: 72, height: 20, fontSize: 11, padding: "0 5px", background: "var(--bg-0)",
                border: "1px solid var(--accent)", color: "var(--fg-0)", fontFamily: "var(--ff-mono)" },
            }),
            h("span", { style: { color: "var(--fg-3)", fontSize: 10 } },
              refMonthOf(monthSel) ? `Alvo de ${window.BS.PT_MONTHS[monthSel.month]}` : "Alvo fixo")
          )
        : h("button", {
            onClick: (e) => { e.stopPropagation(); onEdit(); },
            disabled: true, className: "cat-budget-btn",
            "data-tip": budget != null
              ? `Alvo ${meta.budget_source === "month" ? "deste mês" : "fixo"}: ${fmtBRL(budget)} . Somente leitura na demonstração.`
              : "Definir um alvo de gastos para esta categoria.",
            style: { color: st ? st.color : undefined },
          },
            budget != null
              ? `${Math.round(st.ratio * 100)}% de ${fmtBRL(budget)}${meta.budget_source === "month" ? " · deste mês" : ""}`
              : "+ Definir alvo")
    ),

    isIncome && totalFlow > 0 && h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 } },
      h("span", { style: { color: "var(--fg-3)", fontSize: 10 } },
        `${Math.round(share * 100)}% do total de entradas`)
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
    grouped.forEach((g, name) => {
      const isEmergencyReserve = name.toLowerCase().includes("caixinha") || name.toLowerCase().includes("rdb");
      const typesText = [...g.types].map(typeLabel).join(" · ");
      out.push({
        name: `${name}${g.ids.length > 1 ? ` ×${g.ids.length}` : ""}`,
        sub: isEmergencyReserve ? `Reserva de emergência (resgate imediato) · ${typesText}` : typesText,
        balance: g.balance, ids: g.ids,
      });
    });
    return out.sort((a, b) => b.balance - a.balance);
  }, [investments]);

  return h("div", { className: "widget wg-4" },
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
              : "Sem relatório de corretora neste mês. a última carteira conhecida é de outra data.")
        : investments.length === 0
        ? h("div", { className: "px-empty" }, "Nenhum investimento. importe um relatório B3.")
        : rows.map((r, i) => h("button", {
            key: i,
            className: "inv-pos-btn",
            onClick: () => onOpenPosition && onOpenPosition(r.ids, r.name),
            "data-tip": `Ver histórico de ${r.name}.`,
          },
            h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" } },
              h("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name),
              h("span", { className: "mono", style: { fontSize: 12, fontWeight: 700, color: "var(--fg-0)", flexShrink: 0 } }, fmtBRL(r.balance))
            ),
            h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.04em" } },
              r.sub, total ? ` · ${((r.balance / total) * 100).toFixed(1)}%` : "",
              r.derived ? " · Derivado do extrato" : "")
          )),
      invDelta != null && h("div", { style: { marginTop: "auto", paddingTop: 8, display: "flex", gap: 6, alignItems: "baseline", flexShrink: 0 } },
        h("span", { style: { fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" } }, "Variação no mês"),
        h("span", { className: "kpi-delta", style: { color: invDelta >= 0 ? "var(--pos)" : "var(--info)" } },
          (invDelta >= 0 ? "+" : "−") + fmtBRL(Math.abs(invDelta))),
        invDelta < 0 && h("span", { style: { fontSize: 11, color: "var(--fg-3)" } }, "(Resgate líquido)"))
    )
  );
});

function PixelSharkSprite({ size = 1 }) {
  const w = Math.round(96 * size);
  const h = Math.round(48 * size);
  return React.createElement("svg", {
    className: "retro-shark",
    width: w, height: h,
    viewBox: "0 0 96 48",
    shapeRendering: "crispEdges",
    "aria-hidden": "true",
  },
    // Barbatana dorsal
    React.createElement("rect", { x: 40, y: 0, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 36, y: 4, width: 16, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 32, y: 8, width: 24, height: 4, fill: "var(--accent)" }),
    // Cauda superior
    React.createElement("rect", { x: 0, y: 8, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 4, y: 12, width: 8, height: 4, fill: "var(--accent)" }),
    // Dorso
    React.createElement("rect", { x: 24, y: 12, width: 56, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 8, y: 16, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 16, y: 16, width: 68, height: 4, fill: "var(--accent)" }),
    // Olho
    React.createElement("rect", { x: 64, y: 16, width: 4, height: 4, fill: "#ffffff" }),
    React.createElement("rect", { x: 66, y: 17, width: 2, height: 3, fill: "#0c0d18" }),
    // Centro / Guelras / Focinho
    React.createElement("rect", { x: 8, y: 20, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 16, y: 20, width: 72, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 48, y: 20, width: 2, height: 4, fill: "var(--line-1)" }),
    React.createElement("rect", { x: 52, y: 20, width: 2, height: 4, fill: "var(--line-1)" }),
    React.createElement("rect", { x: 56, y: 20, width: 2, height: 4, fill: "var(--line-1)" }),
    // Cauda inferior / Corpo
    React.createElement("rect", { x: 4, y: 24, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 16, y: 24, width: 44, height: 4, fill: "var(--accent)" }),
    // Interior boca
    React.createElement("rect", { x: 60, y: 24, width: 24, height: 4, fill: "var(--neg)" }),
    // Dentes superiores
    React.createElement("rect", { x: 64, y: 24, width: 4, height: 3, fill: "#ffffff" }),
    React.createElement("rect", { x: 72, y: 24, width: 4, height: 3, fill: "#ffffff" }),
    // Cauda inferior ponta / Barriga clara / Queixo
    React.createElement("rect", { x: 0, y: 28, width: 8, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 16, y: 28, width: 12, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 28, y: 28, width: 28, height: 4, fill: "var(--fg-1)" }),
    React.createElement("rect", { x: 56, y: 28, width: 28, height: 4, fill: "var(--accent)" }),
    // Dentes inferiores
    React.createElement("rect", { x: 60, y: 27, width: 4, height: 3, fill: "#ffffff" }),
    React.createElement("rect", { x: 68, y: 27, width: 4, height: 3, fill: "#ffffff" }),
    React.createElement("rect", { x: 76, y: 27, width: 4, height: 3, fill: "#ffffff" }),
    // Nadadeira peitoral e ventre
    React.createElement("rect", { x: 0, y: 32, width: 4, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 28, y: 32, width: 24, height: 4, fill: "var(--fg-1)" }),
    React.createElement("rect", { x: 36, y: 32, width: 12, height: 4, fill: "var(--line-2)" }),
    React.createElement("rect", { x: 56, y: 32, width: 12, height: 4, fill: "var(--accent)" }),
    React.createElement("rect", { x: 32, y: 36, width: 12, height: 4, fill: "var(--line-2)" }),
    React.createElement("rect", { x: 28, y: 40, width: 8, height: 4, fill: "var(--line-2)" })
  );
}

function RetroMonthLoader({ monthSel }) {
  const mesNome = monthSel && PT_MONTHS[monthSel.month]
    ? `${PT_MONTHS[monthSel.month].toUpperCase()} ${monthSel.year}`
    : "MÊS SELECIONADO";

  return h("div", { className: "retro-loader", role: "status", "aria-live": "polite" },
    h("div", { className: "retro-loader-box" },
      h("div", { className: "retro-loader-topbar" },
        h("span", null, "BROKERSHARK · 16-BIT CARTRIDGE"),
        h("div", { className: "retro-led-wrap" },
          h("div", { className: "retro-led" }),
          h("span", null, "LENDO LEDGER")
        )
      ),

      h("div", { className: "retro-scene" },
        h("div", null,
          h("div", { className: "retro-stage-tag" }, "▶ FASE"),
          h("h2", { className: "retro-stage-title" }, mesNome)
        ),
        h("div", { className: "retro-sprite-container" },
          h(PixelSharkSprite, { size: 1 }),
          h("div", { className: "retro-coins" },
            h("div", { className: "retro-coin" }, "$"),
            h("div", { className: "retro-coin" }, "$"),
            h("div", { className: "retro-coin" }, "$")
          )
        )
      ),

      h("div", null,
        h("div", { className: "retro-bar-track" },
          h("div", { className: "retro-bar-fill" })
        ),
        h("div", { className: "retro-meta" },
          h("div", null,
            h("span", null, "CARREGANDO DADOS"),
            h("span", { className: "retro-cursor" }, "■")
          ),
          h("div", { style: { color: "var(--fg-3)" } }, "EXTRATOS · CARTÕES · ATIVOS")
        )
      ),

      h("div", { className: "retro-footer" },
        h("span", null, "PLAYER 1 READY"),
        h("span", null, "PRESS START")
      )
    )
  );
}

const refMonthOf = (monthSel) =>
  monthSel ? `${monthSel.year}-${String(monthSel.month).padStart(2, "0")}` : undefined;

function DashboardView({ monthSel, monthly, onPickMonth, refreshKey, onEditCategory, onImport, onManageCategories, onManageAccounts, onOpenPosition }) {
  const [available, setAvailable] = _dSt(null);
  const [commitments, setCommitments] = _dSt(null);
  const [availErr, setAvailErr] = _dSt(false);
  const [loadErr, setLoadErr] = _dSt(false);
  const [monthLoadErr, setMonthLoadErr] = _dSt(false);
  const [monthLoading, setMonthLoading] = _dSt(false);
  const [budgetTick, setBudgetTick] = _dSt(0);
  const [retryTick, setRetryTick] = _dSt(0);
  const [accounts, setAccounts] = _dSt([]);
  const [investments, setInvestments] = _dSt([]);
  const [liquidityHistory, setLiquidityHistory] = _dSt([]);
  const [evolution, setEvolution] = _dSt([]);
  const [cashflow, setCashflow] = _dSt(null);
  const [monthTx, setMonthTx] = _dSt([]);
  const [uncatCount, setUncatCount] = _dSt(0);
  const [uncatGroups, setUncatGroups] = _dSt([]);
  const [bulkOpen, setBulkOpen] = _dSt(false);
  const [cmtOpen, setCmtOpen] = _dSt(false);
  const [position, setPosition] = _dSt(null);

  const [expenseCats, setExpenseCats] = _dSt([]);
  const [incomeCats, setIncomeCats] = _dSt([]);
  const [filter, setFilter] = _dSt(() => window.BS.emptyFilter());

  const onToggleFacet = (kind, value) => setFilter(f => window.BS.toggleFacet(f, kind, value));

  const setFilterField = (field, value) => setFilter(f => Object.assign({}, f, { [field]: value }));

  const clearFilter = () => setFilter(window.BS.emptyFilter());

  _dEf(() => { setFilter(window.BS.emptyFilter()); }, [monthSel]);

  _dEf(() => {
    let cancelled = false;
    setAvailErr(false); setLoadErr(false);
    fetchAvailable().then(value => { if (!cancelled) setAvailable(value); })
      .catch(() => { if (!cancelled) setAvailErr(true); });
    Promise.all([fetchAccounts(), fetchInvestments(), fetchLiquidityHistory(), fetchInvestmentEvolution()])
      .then(([ac, invs, lh, ev]) => {
        if (cancelled) return;
        setAccounts(ac); setInvestments(invs);
        setLiquidityHistory(lh || []); setEvolution(ev || []);
      }).catch(() => { if (!cancelled) setLoadErr(true); });
    return () => { cancelled = true; };
  }, [refreshKey, retryTick]);

  _dEf(() => {
    let cancelled = false;
    setMonthLoadErr(false);
    setMonthLoading(!!monthSel);
    if (!monthSel) return;
    const { month, year } = monthSel;
    //> Posição acompanha o mês: sem isto, navegar pra março deixava três cartões
    //> e dois widgets falando de hoje enquanto o resto da tela falava de março.
    Promise.all([
      fetchPosition({ month, year }), fetchCommitments({ month, year }),
      fetchCashflowStatement({ month, year }), fetchMonthTransactions({ month, year }),
      fetchUncategorizedMerchants({ year, month }),
      fetchCategoriesFull("expense", refMonthOf(monthSel)),
      fetchCategoriesFull("income", refMonthOf(monthSel)),
    ]).then(([nextPosition, nextCommitments, nextCashflow, nextTransactions, groups, expenseCategories, incomeCategories]) => {
      if (cancelled) return;
      setPosition(nextPosition); setCommitments(nextCommitments);
      setCashflow(nextCashflow); setMonthTx(nextTransactions);
      setUncatGroups(groups || []);
      setUncatCount((groups || []).reduce((sum, group) => sum + group.count, 0));
      setExpenseCats(expenseCategories || []);
      setIncomeCats(incomeCategories || []);
      setMonthLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setMonthLoadErr(true); setMonthLoading(false);
    });
    return () => { cancelled = true; };
  }, [monthSel, refreshKey, retryTick, budgetTick]);

  _dEf(() => {
    const handler = e => setMonthTx(prev => prev.filter(tx => tx.id !== e.detail.id));
    window.addEventListener("bs-tx-optimistic-delete", handler);
    return () => window.removeEventListener("bs-tx-optimistic-delete", handler);
  }, []);

  const catsIndex = _dMemo(
    () => new Map([...expenseCats, ...incomeCats].map(c => [c.id, c])),
    [expenseCats, incomeCats],
  );

  const reloadBudgets = _dCb(() => {
    setBudgetTick(tick => tick + 1);
  }, []);

  const isLatestMonth = _dMemo(() => {
    if (!monthSel) return false;
    // O saldo por conta vem de accounts.balance_cents (posição atual).
    // monthly inclui 12 meses de planejamento; o último item não é "agora".
    const now = new Date();
    return monthSel.year === now.getFullYear() && monthSel.month === now.getMonth() + 1;
  }, [monthSel]);

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
    //> Mês fechado: contas correntes vêm de `position.accounts` (saldo histórico),
    //> cartões de crédito vêm de `position.credit_cards` (fatura do mês selecionado).
    const cards = (position.credit_cards || []).map(c => {
      const inv = c.open_invoice;
      return {
        ...c,
        open_invoice: inv ? {
          ...inv,
          paid: c._invoice_paid,
          payment_date: c._invoice_payment_date,
          due_date: c._invoice_due_date,
        } : null,
      };
    });
    return [...position.accounts.map(a => ({ ...a, open_invoice: null })), ...cards];
  }, [passado, semPosicao, accounts, position]);

  if (loadErr || monthLoadErr) return h("div", { style: { margin: "48px auto", background: "var(--neg-bg)", border: "1px solid var(--neg)", padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", maxWidth: 480 } },
    h("div", { style: { color: "var(--neg)", fontSize: 14, fontWeight: 700 } }, "Falha ao carregar os dados."),
    h("div", { style: { color: "var(--fg-2)", fontSize: 13 } }, "Não foi possível consultar os dados do ledger. Confira o servidor local e tente novamente."),
    h("button", { className: "px-btn px-btn--danger", onClick: () => setRetryTick(t => t + 1) }, "Tentar novamente"));

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
      h("button", { className: "px-btn", onClick: onManageAccounts }, "Criar conta"),
      h("button", { className: "px-btn px-btn--primary", style: { height: 34, marginTop: 8 }, onClick: onImport },
        h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
          h("path", { d: "M8 11 L8 2" }), h("path", { d: "M4 6 L8 2 L12 6" }), h("path", { d: "M2 14 L14 14" })
        ),
        "Importar arquivos"
      )
    )
  );

  if (monthLoading) return h(RetroMonthLoader, { monthSel });

  const investTotal = investments.reduce((s, i) => s + (i.balance || 0), 0);

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
          h(CategoriesWidget, { monthTx, uncatCount, onOpenBulk: (flow = "expense") => setBulkOpen(flow || "expense"), filter, onToggleFacet,
            catsIndex, monthSel, onBudgetSaved: reloadBudgets, onManageCategories, position, uncatGroups }),
          h(InvestmentsWidget, { investments: viewInvestments, evolution, position, monthSel, onOpenPosition }),
        ),
      ),
      cmtOpen && h(window.BS.CommitmentsPanel, {
        commitments, monthSel, monthTx, onEditCategory,
        onClose: () => setCmtOpen(false),
      }),
      h(window.BS.TxTableWidget, {
        monthSel, refreshKey, onEditCategory,
        openBulk: bulkOpen, onBulkConsumed: () => setBulkOpen(false),
        monthTx, setMonthTx,
        filter, setFilterField, onToggleFacet, onClearFilter: clearFilter,

        accounts, catsIndex, isLatestMonth,
      })
    )
  );
}

window.BS = window.BS || {};
window.BS.DashboardView = DashboardView;
window.BS.RetroMonthLoader = RetroMonthLoader;
window.BS.PixelSharkSprite = PixelSharkSprite;

})();
