(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

  /**
   * @brief   As barras de um mês no fluxo mês a mês.
   * @details No modo "vs ant." o mês anterior é uma MARCA DE NÍVEL atravessando a
   *          barra, não uma barra vizinha: a barra passar da linha já responde
   *          "subiu ou caiu", sem o olho medir a distância entre dois objetos.
   * @warning Altura zero tem duas causas: sem medição não desenha nada; zero MEDIDO
   *          ganha marca neutra, senão finge um valor pequeno que não existiu.
   * @note    Sem `data-tip` aqui: quem fala pelo mês é o balão do slot, um só.
   */
  function PixelBars({ slot, maxV, isPicked, compare }) {
    const specs = window.BS.barSpecs(slot, maxV, compare);

    return h("div", { className: "tl-bars" }, specs.map(s => {
      if (s.height <= 0) {
        return h("div", {
          key: s.key,
          className: s.measured ? "tl-bar tl-bar--zero" : "tl-bar",
        });
      }

      return h("div", {
        key: s.key,
        className: `tl-bar ${s.kind === "income" ? "dither-pos" : "dither-neg"}`,
        style: { height: s.height, opacity: isPicked ? 1 : 0.8 },
      },
        //> Onde a marca cai é geometria, não juízo: acima do topo quando o anterior
        //> foi MAIOR. Pelo sinal do delta a leitura invertia. "subiu" a põe DENTRO.
        s.markAt != null && h("span", {
          className: "tl-mark" + (s.markAt > s.height ? " tl-mark--fora" : ""),
          //> `--tl-queda`: a altura da haste até o topo da barra, que só o JS sabe.
          style: { bottom: s.markAt, "--tl-queda": (s.markAt - s.height) + "px" },
        }),
      );
    }));
  }

  /**
   * @brief Gráfico de duas linhas contínuas conectando os meses (Receitas e Despesas).
   */
  function TimelineLineChart({ slots, maxV, monthSel, activeYear, onPickMonth, textoDoMes }) {
    const W = 1200;
    const H = 80;
    const Y_TOP = 14;
    const Y_BOT = 66;
    const Y_RANGE = Y_BOT - Y_TOP;

    const calcY = (val) => {
      if (!maxV || maxV <= 0) return Y_BOT;
      const r = Math.max(0, Math.min(1, (val || 0) / maxV));
      return Y_BOT - r * Y_RANGE;
    };

    const calcX = (month) => (month - 0.5) * (W / 12);

    const measured = (slots || []).filter(s => !!s.data && s.data.has_data);

    // Pontos de receita e despesa realizados
    const ptsRec = measured.map(s => ({
      month: s.month,
      x: calcX(s.month),
      y: calcY(s.data.income),
      val: s.data.income
    }));

    const ptsDesp = measured.map(s => ({
      month: s.month,
      x: calcX(s.month),
      y: calcY(s.data.expenses),
      val: s.data.expenses
    }));

    // Meses com valores previstos/comprometidos (sem lançamentos realizados)
    const forecasted = (slots || []).filter(s => !!s.data && !s.data.has_data && (s.data.committed > 0));
    const ptsForecast = forecasted.map(s => ({
      month: s.month,
      x: calcX(s.month),
      y: calcY(s.data.committed),
      val: s.data.committed
    }));

    // Linha tracejada de previsão: conecta o último mês medido aos meses futuros previstos
    const lastDesp = ptsDesp.length ? ptsDesp[ptsDesp.length - 1] : null;
    const forecastLinePts = (lastDesp && ptsForecast.length) ? [lastDesp, ...ptsForecast] : ptsForecast;
    const pathForecastLine = forecastLinePts.length >= 2
      ? forecastLinePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";

    // Caminhos SVG das linhas principais
    const pathRecLine = ptsRec.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const pathRecArea = ptsRec.length >= 2
      ? `M ${ptsRec[0].x.toFixed(1)} ${Y_BOT} ` + ptsRec.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + ` L ${ptsRec[ptsRec.length - 1].x.toFixed(1)} ${Y_BOT} Z`
      : "";

    const pathDespLine = ptsDesp.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const pathDespArea = ptsDesp.length >= 2
      ? `M ${ptsDesp[0].x.toFixed(1)} ${Y_BOT} ` + ptsDesp.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + ` L ${ptsDesp[ptsDesp.length - 1].x.toFixed(1)} ${Y_BOT} Z`
      : "";

    // Mês selecionado
    const selMonth = (monthSel && monthSel.year === activeYear) ? monthSel.month : null;
    const selX = selMonth ? calcX(selMonth) : null;

    // Linha de base do horizonte após o último mês ativo (realizado ou previsto)
    const lastActiveMonth = ptsForecast.length
      ? ptsForecast[ptsForecast.length - 1].month
      : (measured.length ? measured[measured.length - 1].month : 0);
    const fmtBRL = (window.BS && window.BS.fmtBRL)
      ? window.BS.fmtBRL
      : v => (v < 0 ? "−" : "") + "R$ " + Math.abs(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return h("div", { className: "tl-chart-wrap" },
      maxV > 0 && h("span", {
        className: "tl-scale-peak",
        "data-tip": `Pico máximo do gráfico: ${fmtBRL(maxV)}`
      }, `Pico ${fmtBRL(maxV)}`),
      h("span", { className: "tl-scale-zero" }, "R$ 0,00"),

      h("svg", {
        className: "tl-chart-svg",
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: "none",
      },
        h("defs", null,
          h("linearGradient", { id: "tl-grad-rec", x1: "0", y1: "0", x2: "0", y2: "1" },
            h("stop", { offset: "0%", stopColor: "var(--pos)", stopOpacity: "0.22" }),
            h("stop", { offset: "100%", stopColor: "var(--pos)", stopOpacity: "0.01" })
          ),
          h("linearGradient", { id: "tl-grad-desp", x1: "0", y1: "0", x2: "0", y2: "1" },
            h("stop", { offset: "0%", stopColor: "var(--neg)", stopOpacity: "0.18" }),
            h("stop", { offset: "100%", stopColor: "var(--neg)", stopOpacity: "0.01" })
          )
        ),

        // Linha guia superior de pico
        h("line", {
          x1: 10, y1: Y_TOP, x2: W - 10, y2: Y_TOP,
          stroke: "var(--line-1)", strokeWidth: "1", strokeDasharray: "3,4", opacity: "0.6"
        }),

        // Linha guia intermediária (50%)
        h("line", {
          x1: 10, y1: Math.round((Y_TOP + Y_BOT) / 2), x2: W - 10, y2: Math.round((Y_TOP + Y_BOT) / 2),
          stroke: "var(--line-1)", strokeWidth: "1", strokeDasharray: "2,6", opacity: "0.35"
        }),

        // Grade horizontal de fundo (linha base suave)
        h("line", {
          x1: 10, y1: Y_BOT, x2: W - 10, y2: Y_BOT,
          stroke: "var(--line-1)", strokeWidth: "1", strokeDasharray: "2,4"
        }),

        // Horizonte tracejado para meses futuros sem dados nem compromissos
        lastActiveMonth > 0 && lastActiveMonth < 12 && h("line", {
          x1: calcX(lastActiveMonth), y1: Y_BOT, x2: calcX(12) + 20, y2: Y_BOT,
          stroke: "var(--line-2)", strokeWidth: "1.5", strokeDasharray: "4,4", opacity: "0.8"
        }),

        // Área sob as curvas
        pathRecArea && h("path", { d: pathRecArea, fill: "url(#tl-grad-rec)" }),
        pathDespArea && h("path", { d: pathDespArea, fill: "url(#tl-grad-desp)" }),

        // Linha tracejada de despesas previstas (comprometido)
        pathForecastLine && h("path", {
          d: pathForecastLine, fill: "none",
          stroke: "var(--warn)", strokeWidth: "2.2",
          strokeDasharray: "4,4",
          strokeLinecap: "round", strokeLinejoin: "round",
          opacity: "0.95"
        }),

        // Linhas principais contínuas
        pathRecLine && h("path", {
          d: pathRecLine, fill: "none",
          stroke: "var(--pos)", strokeWidth: "2.4",
          strokeLinecap: "round", strokeLinejoin: "round"
        }),
        pathDespLine && h("path", {
          d: pathDespLine, fill: "none",
          stroke: "var(--neg)", strokeWidth: "2.4",
          strokeLinecap: "round", strokeLinejoin: "round"
        }),

        // Guia vertical do mês selecionado
        selX != null && h("line", {
          x1: selX, y1: 4, x2: selX, y2: H - 4,
          stroke: "var(--accent)", strokeWidth: "1.5",
          strokeDasharray: "2,2", opacity: "0.85"
        }),

        // Pontos (nós) de cada mês medido
        ptsRec.map(p => {
          const isSel = p.month === selMonth;
          return h("g", { key: `rec-${p.month}` },
            isSel && h("circle", { cx: p.x, cy: p.y, r: 7.5, fill: "none", stroke: "var(--accent)", strokeWidth: "1.5", opacity: "0.9" }),
            h("circle", {
              cx: p.x, cy: p.y,
              r: isSel ? 4.5 : 3.2,
              fill: "var(--pos)",
              stroke: "var(--bg-0)",
              strokeWidth: isSel ? "2" : "1.5",
            })
          );
        }),

        ptsDesp.map(p => {
          const isSel = p.month === selMonth;
          return h("g", { key: `desp-${p.month}` },
            isSel && h("circle", { cx: p.x, cy: p.y, r: 7.5, fill: "none", stroke: "var(--accent)", strokeWidth: "1.5", opacity: "0.9" }),
            h("circle", {
              cx: p.x, cy: p.y,
              r: isSel ? 4.5 : 3.2,
              fill: "var(--neg)",
              stroke: "var(--bg-0)",
              strokeWidth: isSel ? "2" : "1.5",
            })
          );
        }),

        // Pontos de despesas previstas (comprometido)
        ptsForecast.map(p => {
          const isSel = p.month === selMonth;
          return h("g", { key: `fc-${p.month}` },
            isSel && h("circle", { cx: p.x, cy: p.y, r: 7.5, fill: "none", stroke: "var(--accent)", strokeWidth: "1.5", opacity: "0.9" }),
            h("circle", {
              cx: p.x, cy: p.y,
              r: isSel ? 4.5 : 3.2,
              fill: "var(--bg-0)",
              stroke: "var(--warn)",
              strokeWidth: isSel ? "2.2" : "1.8",
            })
          );
        }),

        // Nós dos meses sem medição nem compromisso (vazios)
        (slots || []).filter(s => !s.data || (!s.data.has_data && !s.data.committed)).map(s => h("circle", {
          key: `empty-${s.month}`,
          cx: calcX(s.month), cy: Y_BOT,
          r: 2, fill: "none", stroke: "var(--line-2)", strokeWidth: "1"
        })),

        // Hitboxes transparentes de interação em cada mês diretamente no gráfico
        (slots || []).map(s => {
          const colW = W / 12;
          const colX = (s.month - 1) * colW;
          const selecionavel = s.data || s.futuro;
          return h("rect", {
            key: `hit-${s.month}`,
            x: colX, y: 0, width: colW, height: H,
            fill: "transparent",
            style: { cursor: selecionavel ? "pointer" : "default" },
            onClick: () => selecionavel && onPickMonth && onPickMonth({ year: activeYear, month: s.month }),
            "data-tip": (textoDoMes && typeof textoDoMes === "function") ? textoDoMes(s, activeYear, maxV) : undefined,
          });
        })
      )
    );
  }

  window.BS = window.BS || {};
  window.BS.PixelBars = PixelBars;
  window.BS.TimelineLineChart = TimelineLineChart;
})();
