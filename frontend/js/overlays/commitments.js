(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);
const { fmtBRL, fmtDateBR, PT_MONTHS, prettifyDesc } = window.BS;


/**
 * @brief   O que está comprometido no mês selecionado, em drill-down.
 * @details Duas fontes, as duas ancoradas em dado real: parcela que o banco declarou
 *          na fatura ("2 de 3") e recorrência que VOCÊ apontou na ficha de um
 *          lançamento. Nada é deduzido do histórico.
 * @note    Modal e não Overlay: são três listas curtas, sem tabela nem histórico —
 *          uma coluna de tela cheia deixaria o vazio dominando a tela.
 */
function CommitmentsPanel({ commitments, monthSel, monthTx, onEditCategory, onClose }) {
  const faturas = (commitments && commitments.invoices) || [];
  const parcelas = (commitments && commitments.installments) || [];
  const recorrentes = (commitments && commitments.recurring) || [];
  const totalSaida = (commitments && commitments.total_out) || 0;
  const mesNome = monthSel ? PT_MONTHS[monthSel.month] : "";
  const vazio = faturas.length === 0 && parcelas.length === 0 && recorrentes.length === 0;

  //> A ficha só existe pra lançamento REAL: previsto não está em `transactions`.
  const abrir = (id) => {
    const tx = (monthTx || []).find(t => t.id === id);
    if (tx && onEditCategory) { onClose(); onEditCategory(tx); }
  };

  const linha = ({ key, id, quando, titulo, selo, seloCor, valor, flow, esmaecido }) =>
    h("button", {
      key,
      className: "cmt-row",
      onClick: id ? () => abrir(id) : undefined,
      disabled: !id,
      style: esmaecido ? { opacity: 0.65 } : null,
    },
      h("span", { className: "mono cmt-quando" }, quando),
      h("span", { className: "cmt-titulo", "data-tip": titulo }, titulo),
      selo && h("span", { className: "cmt-selo", style: { color: seloCor, borderColor: seloCor } }, selo),
      h("span", { className: "mono cmt-valor", style: { color: flow === "income" ? "var(--pos)" : "var(--warn)" } },
        (flow === "income" ? "+" : "−") + fmtBRL(Math.abs(valor))),
    );

  //> Lançada e prevista viram SEÇÕES, não estilos de linha: o subtotal de cada uma
  //> responde "quanto já é fato, quanto ainda é contrato". Só o das previstas soma.
  const grupoParcelas = (chave, rotulo, dica) => {
    const itens = parcelas.filter(p => (chave === "previstas") === !!p.projected);
    if (!itens.length) return null;
    const soma = itens.reduce((s, p) => s + (p.flow === "income" ? 0 : p.amount), 0);
    return h(React.Fragment, { key: chave },
      h("div", { className: "cmt-secao", "data-tip": dica },
        h("span", null, rotulo),
        h("span", { className: "mono cmt-secao-total" }, "−" + fmtBRL(soma)),
      ),
      itens.map(p => linha({
        key: p.projected ? "f" + p.forecast_id : "p" + p.transaction_id,
        id: p.transaction_id,
        quando: fmtDateBR(p.date),
        titulo: prettifyDesc(p.label),
        selo: `${p.seq}/${p.total}`,
        seloCor: p.projected ? "var(--warn)" : "var(--fg-3)",
        valor: p.amount,
        flow: p.flow,
      })),
    );
  };

  return h(window.BS.Modal, {
    open: true, onClose, width: 720,
    title: `Comprometido em ${mesNome}`,
  },
    h("div", { className: "cmt-painel" },
      vazio
        ? h("div", { className: "px-empty", style: { lineHeight: 1.6 } },
            "Nada comprometido neste mês.",
            h("br"),
            h("span", { style: { fontSize: 11 } },
              "Aparecem aqui: fatura de cartão em aberto, parcela que o banco declarou e recorrente que você marcou na ficha do lançamento."))
        : h(React.Fragment, null,

            //> A fatura vem primeiro: é o maior pedaço do total, e o card existe pra
            //> explicar o número — não pra mostrar tudo menos a parte que mais pesa.
            faturas.length > 0 && h(React.Fragment, null,
              h("div", { className: "cmt-secao",
                "data-tip": "O que falta pagar do cartão neste mês. As parcelas lançadas são itens dela; quem compromete é a fatura." },
                h("span", null, "Fatura em aberto"),
                h("span", { className: "mono cmt-secao-total" },
                  "−" + fmtBRL(faturas.reduce((s, f) => s + f.amount, 0)))),
              faturas.map(f => linha({
                key: "inv" + f.invoice_id,
                quando: fmtDateBR(f.due_date),
                titulo: f.account_name || f.account_id,
                selo: "vence",
                seloCor: "var(--warn)",
                valor: f.amount,
                flow: "expense",
              })),
            ),

            grupoParcelas("lancadas", "Parcelas · lançadas",
              "já são item da fatura deste mês — quem compromete é a fatura, não a linha"),
            grupoParcelas("previstas", "Parcelas · previstas",
              "o banco declarou o contrato e a fatura ainda não chegou — é o que soma no total"),

            parcelas.some(p => p.remaining > 0) && h("div", { className: "cmt-nota" },
              (() => {
                const n = parcelas.reduce((s, p) => s + p.remaining, 0);
                return `${n} ${n === 1 ? "parcela ainda vem" : "parcelas ainda vêm"} depois deste mês.`;
              })()),

            recorrentes.length > 0 && h(React.Fragment, null,
              h("div", { className: "cmt-secao" }, h("span", null, "Recorrentes")),
              recorrentes.map(r => linha({
                key: "r" + r.transaction_id,
                id: r.transaction_id,
                quando: r.confirmed ? fmtDateBR(r.date) : `dia ${String(r.day).padStart(2, "0")}`,
                titulo: prettifyDesc(r.label),
                //> Quantas FALTAM, não a data-limite, que obriga a contar de cabeça.
                //> `historic`: sem o selo, encerrada pareceria ativa em todo mês passado.
                selo: r.historic ? "encerrada"
                  : r.confirmed ? "já caiu"
                  : r.until ? `restam ${window.BS.monthSpan(commitments.month, r.until)}` : "previsto",
                seloCor: r.historic || r.confirmed ? "var(--fg-3)" : "var(--warn)",
                valor: r.amount,
                flow: r.flow,
                esmaecido: r.historic,
              })),
            ),
          ),
    ),
    h("div", { className: "cmt-rodape" },
      h("span", null, "Total que ainda vai sair"),
      h("b", { className: "mono", style: { color: "var(--warn)", fontSize: 15 } }, "−" + fmtBRL(totalSaida)),
    ),
  );
}

window.BS = window.BS || {};
window.BS.CommitmentsPanel = CommitmentsPanel;

})();
