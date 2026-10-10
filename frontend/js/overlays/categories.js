(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _ovSt, useEffect: _ovEf } = React;

/**
 * @brief   Regras aprendidas ao categorizar, com o caminho de volta.
 * @details Mora aqui e não num overlay próprio: regra é categoria vista pelo lado do
 *          comerciante. mesma cabeça, um ponto de acesso a menos.
 */
function RulesTab({ onRefresh }) {
  const [rules, setRules] = _ovSt(null);
  //> As DUAS listas: sem isso, regra de receita com a aba em despesa some do select.
  const [cats, setCats] = _ovSt([]);
  const [err, setErr] = _ovSt("");
  const [busy, setBusy] = _ovSt(false);

  const reload = () => fetchRules().then(setRules).catch(e => setErr(e.message));
  _ovEf(() => {
    reload();
    Promise.all([fetchCategoriesFull("expense"), fetchCategoriesFull("income")])
      .then(([e, i]) => setCats([...e, ...i]))
      .catch(() => {});
  }, []);

  async function run(fn) {
    setBusy(true); setErr("");
    try { await fn(); await reload(); onRefresh && onRefresh(); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  if (rules == null) return h("div", { className: "px-empty" }, "Carregando…");

  if (!rules.length) {
    return h("div", { className: "px-empty", style: { lineHeight: 1.6 } },
      "Nada aprendido ainda. categorize um lançamento e a primeira aparece aqui.");
  }

  return h(React.Fragment, null,
    err && h("div", { style: { color: "var(--neg)", fontSize: 12, padding: "8px 0" } }, err),
    h("div", { className: "px-list" },
      rules.map(r => h("div", {
        key: r.id, className: "cat-row",
        style: r.enabled ? null : { opacity: 0.5 },
      },
        h("div", { className: "px-swatch", style: { background: r.orphan ? "var(--neg)" : "var(--accent)" } }),

        h("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } },
          h("span", { className: "mono", style: { fontSize: 12, color: "var(--fg-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.matcher),
          h("span", { style: { fontSize: 10, color: "var(--fg-3)" } },
            r.pending_matches > 0
              ? `Classificaria ${r.pending_matches} ${r.pending_matches === 1 ? "lançamento" : "lançamentos"} pendentes`
              : "Nenhum lançamento pendente no momento")),

        r.orphan
          ? h("span", { style: { fontSize: 11, color: "var(--neg)", flexShrink: 0 } }, "Categoria excluída")
          : h("select", {
              className: "px-field", value: r.category_id ?? "", disabled: true,
              style: { flexShrink: 0, maxWidth: 190 },
              onChange: e => run(() => patchRule(r.id, { category_id: Number(e.target.value) })),
            },
              h("optgroup", { label: "Categorias de Gastos" },
                cats.filter(c => c.flow === "expense").map(c => h("option", { key: c.id, value: c.id }, c.name))
              ),
              h("optgroup", { label: "Categorias de Entrada" },
                cats.filter(c => c.flow === "income").map(c => h("option", { key: c.id, value: c.id }, c.name))
              )
            ),

        h("div", { className: "cat-actions" },
          h("button", {
            className: "px-btn px-btn--ghost px-btn--sm", disabled: true,
            "data-tip": r.enabled ? "Desativar. interrompe sugestões mantendo a regra salva." : "Ativar regra.",
            onClick: () => run(() => patchRule(r.id, { enabled: r.enabled ? 0 : 1 })),
          }, r.enabled ? "◉" : "○"),
          h("button", {
            className: "px-btn px-btn--ghost px-btn--sm cat-del", disabled: true,
            "data-tip": "Excluir regra. lançamentos já categorizados são mantidos.",
            onClick: () => run(() => deleteRule(r.id)),
          }, "×"),
        ),
      ))),
  );
}

function CategoriesPanel({ refreshKey, onRefresh, onClose }) {
  const [flow, setFlow] = _ovSt("expense");
  const [cats, setCats] = _ovSt([]);
  const [newName, setNewName] = _ovSt("");
  const [adding, setAdding] = _ovSt(false);
  const [err, setErr] = _ovSt("");
  const [deleteModal, setDeleteModal] = _ovSt(null);
  const [reassignTo, setReassignTo] = _ovSt("");
  const [deleting, setDeleting] = _ovSt(false);
  const [editingId, setEditingId] = _ovSt(null);
  const [editName, setEditName] = _ovSt("");

  _ovEf(() => { fetchCategoriesFull(flow).then(setCats); }, [flow, refreshKey]);

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true); setErr("");
    try {
      await postCategory(name, flow);
      setNewName("");
      fetchCategoriesFull(flow).then(setCats);
      onRefresh && onRefresh();
    } catch (ex) { setErr(ex.message); } finally { setAdding(false); }
  }

  async function commitRename(cat) {
    if (editName.trim() && editName.trim() !== cat.name) {
      await patchCategory(cat.id, editName.trim());
      fetchCategoriesFull(flow).then(setCats);
      onRefresh && onRefresh();
    }
    setEditingId(null);
  }

  //> Vazio é escolha válida ("deixar sem categoria"); `reassign_to_id: 0` o servidor recusa.
  async function handleDelete() {
    if (!deleteModal) return;
    setDeleting(true); setErr("");
    try {
      await deleteCategory(deleteModal.id, reassignTo ? parseInt(reassignTo, 10) : undefined);
      setDeleteModal(null); setReassignTo("");
      fetchCategoriesFull(flow).then(setCats);
      onRefresh && onRefresh();
    } catch (ex) { setErr(ex.message); } finally { setDeleting(false); }
  }

  const otherCats = deleteModal ? cats.filter(c => c.id !== deleteModal.id) : cats;

  const swatch = flow === 'expense' ? "var(--neg)" : "var(--pos)";

  const footerCategories = h("div", { className: "modal-footer-wrap" },
    h("div", { className: "modal-footer-meta" },
      `${cats.length} ${cats.length === 1 ? "categoria" : "categorias"} de ${flow === "expense" ? "gastos" : "entrada"}`
    ),
    h("div", { className: "modal-footer-actions" },
      h("button", { className: "px-btn", onClick: onClose }, "Fechar")
    )
  );

  return h(window.BS.Modal, { open: true, onClose, title: "Categorias", width: 620, footer: footerCategories },
    h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },

      h(window.BS.SegmentControl, {
        options: [{ value: "expense", label: "Gastos" }, { value: "income", label: "Entradas" }],
        value: flow, onChange: setFlow, columns: 2, fill: true,
      }),
      h("form", { onSubmit: handleAdd, style: { display: "flex", gap: 8 } },
        h("input", {
          disabled: true, className: "px-field", type: "text", placeholder: `Nova categoria de ${flow === 'expense' ? 'gasto' : 'entrada'}…`, value: newName,
          onChange: e => setNewName(e.target.value),
          style: { flex: 1 }
        }),
        h("button", {
          className: "px-btn px-btn--primary", type: "submit", disabled: true,
        }, adding ? "Adicionando…" : "Adicionar")
      ),
      err && h("div", { className: "px-alert px-alert--neg" }, err),

      cats.length === 0
        ? h("div", { className: "px-empty" }, "Nenhuma categoria de " + (flow === "expense" ? "gastos" : "entrada") + " ainda.")
        : h("div", { className: "px-list" },
            cats.map((cat) => h("div", { className: "cat-row", key: cat.id },
              h("div", { className: "px-swatch", style: { background: swatch } }),
              editingId === cat.id
                ? h("input", {
                    className: "px-field", autoFocus: true,
                    value: editName,
                    onChange: e => setEditName(e.target.value),
                    onKeyDown: e => {
                      if (e.key === "Escape") setEditingId(null);
                      if (e.key === "Enter") commitRename(cat);
                    },
                    onBlur: () => commitRename(cat),
                    style: { flex: 1 }
                  })
                : h("button", {
                    disabled: true, className: "cat-name",
                    onClick: () => { setEditingId(cat.id); setEditName(cat.name); }
                  }, cat.name),
              h("span", { className: "cat-count" },
                cat.transaction_count === 1 ? "1 lançamento" : `${cat.transaction_count} lançamentos`
              ),
              editingId !== cat.id && h("div", { className: "cat-actions" },
                h("button", {
                  className: "px-btn px-btn--ghost px-btn--sm", "data-tip": "Renomear categoria.", "aria-label": "Renomear", disabled: true,
                  onClick: () => { setEditingId(cat.id); setEditName(cat.name); }
                }, "✎"),
                h("button", {
                  className: "px-btn px-btn--ghost px-btn--sm cat-del", "data-tip": "Excluir categoria.", "aria-label": "Excluir", disabled: true,
                  onClick: () => { setDeleteModal(cat); setReassignTo(""); setErr(""); }
                }, "×")
              )
            ))
          ),

      h("details", { className: "px-details" },
        h("summary", null, "Regras automáticas aprendidas"),
        h("p", { style: { margin: "0 0 10px", fontSize: 11, color: "var(--fg-3)", lineHeight: 1.6 } },
          "Quando você escolhe a categoria de um lançamento, o BrokerShark memoriza o estabelecimento correspondente. ",
          "Na próxima vez que a mesma descrição aparecer, a categoria virá sugerida na tabela do mês, ",
          "na categorização em lote e na prévia da importação. A aplicação é sempre confirmada por você. ",
          "Você pode corrigir ou excluir regras aqui a qualquer momento; lançamentos já categorizados não são afetados."),
        h(RulesTab, { onRefresh }),
      ),
    ),

    h(window.BS.Modal, {
      open: !!deleteModal, onClose: () => setDeleteModal(null), title: "Excluir categoria", width: 440,
      footer: h("div", { className: "modal-footer-wrap" },
        h("div", { className: "modal-footer-meta" }),
        h("div", { className: "modal-footer-actions" },
          h("button", { className: "px-btn px-btn--ghost", onClick: () => setDeleteModal(null) }, "Cancelar"),
          h("button", {
            className: "px-btn px-btn--danger",
            onClick: handleDelete,
            disabled: deleting,
          }, deleting ? "Excluindo…" : "Excluir categoria")
        )
      )
    },
      deleteModal && h("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
        h("p", { style: { fontSize: 14, color: "var(--fg-0)", margin: 0, lineHeight: 1.4 } },
          "Deseja excluir a categoria ", h("strong", { style: { color: "var(--neg)" } }, deleteModal.name), "?"
        ),
        deleteModal.transaction_count === 0
          ? h("p", { style: { fontSize: 12, color: "var(--fg-3)", margin: 0, lineHeight: 1.5 } },
              "Nenhum lançamento usa esta categoria, então nada muda no seu histórico.")
          : h("div", { className: "px-alert px-alert--warn", style: { flexDirection: "column", gap: 8 } },
              h("p", { style: { fontSize: 13, color: "var(--warn)", margin: 0, fontWeight: 600 } },
                deleteModal.transaction_count === 1
                  ? "1 lançamento está nesta categoria."
                  : `${deleteModal.transaction_count} lançamentos estão nesta categoria.`),
              h("p", { style: { fontSize: 12, color: "var(--fg-2)", margin: 0, lineHeight: 1.5 } },
                "Eles não são apagados. Escolha para onde vão:"),
              h("select", {
                className: "px-field", value: reassignTo, onChange: e => setReassignTo(e.target.value),
                "aria-label": "Para onde vão os lançamentos", style: { width: "100%" }
              },
                //> Única opção que sempre existe. Sem ela, a última categoria de um
                //> fluxo não tinha destino e o botão ficava desligado pra sempre.
                h("option", { value: "" }, "Deixar sem categoria"),
                otherCats.map(c => h("option", { key: c.id, value: c.id }, c.name))
              )
            ),
        err && h("div", { className: "px-alert px-alert--neg" }, err),
      )
    )
  );
}

window.BS = window.BS || {};
window.BS.CategoriesPanel = CategoriesPanel;

})();
