(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);
const { useState, useEffect } = React;
const { fmtBRL, fullDateBR, PT_MONTHS } = window.BS;

const anosEntre = (a, b) => {
  if (!a || !b) return null;
  const meses = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12
              + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
  return meses / 12;
};

const nomeMes = (ym) =>
  ym ? `${PT_MONTHS[Number(ym.slice(5, 7))].toLowerCase()} de ${ym.slice(0, 4)}` : "";

/**
 * @brief   O ledger inteiro num número só. o choque de realidade.
 * @details Todo o resto do painel fala de UM mês, e num mês R$ 300 de mercado é um
 *          item de lista. Somados os anos, o mesmo hábito vira um número que muda
 *          decisão. É a única leitura que ignora o seletor de mês de propósito.
 */
function LifetimePanel({ onClose }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => { fetchLifetime().then(setD).catch(() => setErro(true)); }, []);

  const anos = d && anosEntre(d.first_date, d.last_date);

  const bloco = (rotulo, valor, cor, nota) =>
    h("div", { className: "lt-bloco" },
      h("span", { className: "lt-rotulo" }, rotulo),
      h("span", { className: "mono lt-valor", style: { color: cor } }, fmtBRL(valor)),
      nota && h("span", { className: "lt-nota" }, nota),
    );

  const footerLifetime = h("div", { className: "modal-footer-wrap" },
    h("div", { className: "modal-footer-meta" },
      d && [
        h("span", { key: "s" }, "Sobrou do fluxo: "),
        h("b", { key: "v", style: { color: d.saved >= 0 ? "var(--pos)" : "var(--neg)" } },
          (d.saved >= 0 ? "+" : "−") + fmtBRL(Math.abs(d.saved))),
        d.transactions != null && h("span", { key: "t" }, ` · ${d.transactions} lançamentos`)
      ]
    ),
    h("div", { className: "modal-footer-actions" },
      h("button", { className: "px-btn", onClick: onClose }, "Fechar")
    )
  );

  return h(window.BS.Modal, { open: true, onClose, width: 640, title: "Desde o Começo", footer: footerLifetime },
    erro
      ? h("div", { className: "px-empty" }, "Falha ao carregar.")
      : !d
        ? h("div", { className: "px-empty" }, "Somando…")
        : h(React.Fragment, null,

            h("div", { className: "lt-periodo" },
              `${fullDateBR(d.first_date)} → ${fullDateBR(d.last_date)}`,
              anos != null && h("b", null, ` · ${anos.toFixed(1)} anos`),
              d.transactions != null && h("span", null, ` · ${d.transactions} lançamentos`)),

            h("div", { className: "lt-grid" },
              bloco("Receitas recebidas", d.earned, "var(--pos)", "Receita efetiva. sem transferências nem resgates."),
              bloco("Despesas realizadas", d.spent, "var(--neg)", "Despesas de consumo. sem pagamentos de fatura nem investimentos."),
            ),

            //> `saved` é fluxo, não patrimônio (investimento e transferência ficam de
            //> fora): sem dizer isso, vira uma terceira resposta pra "quanto eu tenho".
            h("div", { className: "lt-sobra" },
              h("span", null, "Sobrou do fluxo"),
              h("b", { className: "mono", style: { color: d.saved >= 0 ? "var(--pos)" : "var(--neg)" } },
                (d.saved >= 0 ? "+" : "−") + fmtBRL(Math.abs(d.saved))),
              h("span", { className: "lt-nota" },
                `De cada R$ 100 recebidos, R$ ${(d.earned ? (d.spent / d.earned) * 100 : 0).toFixed(0)} viraram despesas.`),
            ),

            h("div", { className: "lt-linhas" },
              h("div", { className: "stat-row" },
                h("span", { className: "k" }, `Média por mês (${d.months} meses com gasto)`),
                h("span", { className: "v mono" }, fmtBRL(d.avg_month))),
              d.worst_month && h("div", { className: "stat-row" },
                h("span", { className: "k" }, "Mês mais caro"),
                h("span", { className: "v mono" },
                  `${fmtBRL(d.worst_month.spent)} · ${nomeMes(d.worst_month.ym)}`)),
              d.invested_net != null && !isNaN(d.invested_net) && h("div", { className: "stat-row" },
                h("span", { className: "k", "data-tip": "Aplicações menos resgates. não reflete a rentabilidade da carteira." },
                  "Aplicações líquidas"),
                h("span", { className: "v mono", style: { color: "var(--reserve)" } }, fmtBRL(d.invested_net))),
            ),

            h(React.Fragment, null,
              h("div", { className: "cmt-secao" },
                h("span", null, "Despesas por categoria"),
                h("span", { className: "mono cmt-secao-total" }, `${d.months} meses`)),
              //> Aparece SEMPRE, inclusive vazia: aqui o vazio não é falta de dado, é
              //> falta de decisão sua. escondida, a pergunta ficava sem resposta.
              d.top_categories.some(c => c.name !== "Sem categoria")
                ? d.top_categories.map(c => h("div", { key: c.name, className: "lt-cat" },
                    h("span", { className: "lt-cat-nome" }, c.name),
                    h("span", { className: "lt-cat-barra" },
                      h("span", { style: { width: `${d.spent ? (c.spent / d.spent) * 100 : 0}%` } })),
                    h("span", { className: "mono lt-cat-valor" }, fmtBRL(c.spent)),
                  ))
                : h("div", { className: "lt-sem-cat" },
                    `Os ${fmtBRL(d.spent)} ainda estão todos em "Sem categoria".`,
                    h("br"),
                    h("span", null, "Categorize os lançamentos e este quadro mostra quanto foi para cada uma, no período inteiro.")),
            ),

            h("div", { className: "lt-disclaimer" },
              "* Transferências e pagamentos de fatura entre contas próprias ficam fora dos totais."
            ),
          ),
  );
}

window.BS = window.BS || {};
window.BS.LifetimePanel = LifetimePanel;

})();
