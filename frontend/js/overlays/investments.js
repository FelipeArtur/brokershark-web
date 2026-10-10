(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _ivSt, useEffect: _ivEf } = React;

// Drill-down de posição: a promessa do Produto.md ("resumo no widget, posições
// em drill-down") não existia. as linhas do widget eram div sem onClick e não
// havia overlay nenhum. Clicar num investimento não fazia nada.
//
// Uma linha do widget pode representar MAIS DE UMA posição: posições do mesmo
// grupo vêm agregadas (×2). Por isso o painel recebe uma lista de ids e mostra
// um seletor quando há mais de uma.

function InvestmentPanel({ ids, title, onClose, month }) {
  //> Toda data aqui atravessa anos (medição e vencimento), então nunca fmtDateBR.
  const { fmtBRL, fullDateBR, Modal, SegmentControl } = window.BS;

  const [sel, setSel] = _ivSt(ids && ids.length ? ids[0] : null);
  const [pos, setPos] = _ivSt(null);
  const [names, setNames] = _ivSt({});
  const [err, setErr] = _ivSt("");

  const ym = month ? (typeof month === "string" ? month : (month.year && month.month ? `${month.year}-${String(month.month).padStart(2, "0")}` : null)) : null;
  const monthLabel = ym && ym.length >= 7 ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "";

  _ivEf(() => {
    if (sel == null) return;
    setPos(null); setErr("");
    fetchInvestment(sel, month)
      .then(p => { setPos(p); setNames(n => ({ ...n, [p.id]: p.name, [sel]: p.name })); })
      .catch(e => setErr(e.message || "Falha ao carregar a posição."));
  }, [sel, month]);

  _ivEf(() => {
    (ids || []).filter(id => id !== sel).forEach(id => {
      fetchInvestment(id, month).then(p => setNames(n => ({ ...n, [p.id]: p.name, [id]: p.name }))).catch(() => {});
    });
  }, [month, ids]);

  const snaps = (pos && pos.snapshots) || [];
  const last = snaps.length ? snaps[snaps.length - 1] : null;
  const first = snaps.length ? snaps[0] : null;

  //> Escala comum: sem ela, um mês ruim desenharia igual a um bom.
  const maxNet = snaps.reduce((m, s) => Math.max(m, s.net || 0), 0);

  const isReserva = pos && (
    (pos.group_name && (pos.group_name.toLowerCase().includes("caixinha") || pos.group_name.toLowerCase().includes("rdb"))) ||
    pos.type === "rdb" ||
    (pos.name && pos.name.toLowerCase().includes("caixinha"))
  );

  const ficha = [
    pos && pos.code && ["Código", pos.code],
    pos && pos.type && ["Tipo", String(pos.type).toUpperCase()],
    isReserva && ["Liquidez", "Resgate imediato D+0 (Reserva de emergência)"],
    pos && pos.indexer && ["Indexador", pos.indexer],
    pos && pos.rate_text && ["Taxa", pos.rate_text],
    pos && pos.maturity_date && ["Vencimento", fullDateBR(pos.maturity_date)],
    pos && pos.bank && ["Custódia", String(pos.bank).toUpperCase()],
    pos && pos.source && ["Origem", pos.source === "ledger" ? "Derivada do extrato" : pos.source.toUpperCase()],
    pos && pos.closed_at && ["Encerrada em", fullDateBR(pos.closed_at)],
  ].filter(Boolean);

  const modalTitle = (pos && pos.name) || title || "Posição de Investimento";

  const footerInvestments = h("div", { className: "modal-footer-wrap" },
    h("div", { className: "modal-footer-meta" },
      last && [
        h("span", { key: "l" }, "Líquido: "),
        h("b", { key: "v", style: { color: "var(--reserve)" } }, fmtBRL(last.net)),
        last.yield != null && [
          h("span", { key: "sep" }, " · Rendimento: "),
          h("b", { key: "y", style: { color: last.yield >= 0 ? "var(--pos)" : "var(--neg)" } },
            (last.yield >= 0 ? "+" : "−") + fmtBRL(Math.abs(last.yield)))
        ]
      ]
    ),
    h("div", { className: "modal-footer-actions" },
      h("button", { className: "px-btn", onClick: onClose }, "Fechar")
    )
  );

  return h(Modal, {
    open: true,
    onClose,
    title: modalTitle,
    width: 860,
    footer: footerInvestments,
  },
    h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },

      ids && ids.length > 1 && h(SegmentControl, {
        options: ids.map(id => ({ value: id, label: names[id] || `#${id}` })),
        value: sel, onChange: setSel, columns: Math.min(ids.length, 3), fill: true,
      }),

      last && h("div", { className: "inv-kpi-grid" },
        h("div", { className: "inv-kpi-card" },
          h("div", { className: "inv-kpi-label" }, "Valor líquido"),
          h("div", { className: "inv-kpi-val", style: { color: "var(--reserve)" } }, fmtBRL(last.net)),
          h("div", { className: "inv-kpi-sub" }, `Medição em ${fullDateBR(last.ref_date)}`)
        ),
        last.yield != null && h("div", { className: "inv-kpi-card" },
          h("div", { className: "inv-kpi-label" }, "Rendimento"),
          h("div", { className: "inv-kpi-val", style: { color: last.yield >= 0 ? "var(--pos)" : "var(--neg)" } },
            (last.yield >= 0 ? "+" : "−") + fmtBRL(Math.abs(last.yield))),
          h("div", { className: "inv-kpi-sub" },
            `${last.yield_pct >= 0 ? "+" : "−"}${Math.abs(last.yield_pct).toFixed(2)}% sobre o valor aplicado.`)
        ),
        first && snaps.length > 1 && h("div", { className: "inv-kpi-card" },
          h("div", { className: "inv-kpi-label" }, "Acompanhada desde"),
          h("div", { className: "inv-kpi-val", style: { color: "var(--fg-1)" } }, fullDateBR(first.ref_date)),
          h("div", { className: "inv-kpi-sub" }, `${snaps.length} medições registradas`)
        )
      ),

      err && h("div", { className: "px-alert px-alert--neg" }, err),

      ficha.length > 0 && h("div", { className: "inv-ficha" },
        ficha.map(([k, v]) => h("div", { key: k, className: "inv-tag" },
          h("span", { className: "inv-tag-k" }, k),
          h("span", { className: "inv-tag-v" }, v)
        ))
      ),

      !pos && !err && h("div", { className: "px-empty" }, "Carregando detalhes da posição…"),

      pos && snaps.length === 0 && h("div", { className: "px-empty" },
        "Sem medição registrada. Um relatório B3 mais novo traz o histórico."),

      snaps.length > 0 && h(React.Fragment, null,
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 } },
          h("div", { className: "px-label", style: { margin: 0 } },
            monthLabel ? `Histórico de medições (até ${monthLabel})` : "Histórico de medições"
          ),
          h("span", { style: { fontSize: 11, color: "var(--fg-3)" } }, `${snaps.length} ${snaps.length === 1 ? "registro" : "registros"}`)
        ),

        h("p", { style: { margin: "0 0 12px", fontSize: 11, color: "var(--fg-3)", lineHeight: 1.6 } },
          pos.source === "ledger"
            ? "Esta posição não tem custódia em corretora: o saldo é o que entrou menos o que saiu direto do extrato. Não há cotação a acompanhar."
            : "Cada linha é um relatório da corretora que você importou. O rendimento sai da diferença entre líquido e aplicado na hora de mostrar."),

        h("div", { style: { maxHeight: 380, overflowY: "auto", border: "1px solid var(--line-1)" } },
          h("table", { className: "grid-table", style: { margin: 0 } },
            h("thead", { style: { position: "sticky", top: 0, zIndex: 2, background: "var(--bg-1)" } }, h("tr", null,
              h("th", { style: { width: "18%" } }, "Data"),
              h("th", { style: { width: "20%", textAlign: "right" } }, "Aplicado"),
              h("th", { style: { width: "20%", textAlign: "right" } }, "Líquido"),
              h("th", { style: { width: "22%", textAlign: "right" } }, "Rendimento"),
              h("th", { style: { width: "20%" } }, "Participação")
            )),
            h("tbody", null, snaps.slice().reverse().map((s, i) => h("tr", { key: s.ref_date + i },
              h("td", { className: "mono", style: { color: "var(--fg-2)" } }, fullDateBR(s.ref_date)),
              h("td", { className: "mono num", style: { color: "var(--fg-2)" } },
                s.applied > 0 ? fmtBRL(s.applied) : "—"),
              h("td", { className: "mono num", style: { color: "var(--fg-0)", fontWeight: 700 } }, fmtBRL(s.net)),
              h("td", { className: "mono num", style: { color: s.yield == null ? "var(--fg-3)" : (s.yield >= 0 ? "var(--pos)" : "var(--neg)") } },
                s.yield == null ? "—" : (s.yield >= 0 ? "+" : "−") + fmtBRL(Math.abs(s.yield))),
              h("td", null,
                h("div", { className: "dither-pos", style: { height: 8, width: maxNet > 0 ? `${Math.max((s.net / maxNet) * 100, 2)}%` : 0, opacity: 0.85 } }))
            )))
          )
        )
      )
    )
  );
}

window.BS = window.BS || {};
window.BS.InvestmentPanel = InvestmentPanel;

})();
