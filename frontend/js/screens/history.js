(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _s2St, useEffect: _s2Ef, useMemo: _s2Memo, useCallback: _s2Cb } = React;
const { fmtBRL, PT_MONTHS, isConsumptionExpense, isRevenue, isInvest, isSelf } = window.BS;

const SORT_KEYS = {
  date:     t => t.date || "",
  desc:     t => (t.display_name || window.BS.prettifyDesc(t.description) || "").toLowerCase(),
  cat:      t => (t.category || "").toLowerCase(),
  account:  t => t.account_id || "",
  method:   t => t.method || "",

  amount:   t => t.flow === "expense" ? -t.amount : t.amount,
};

const COLLAPSE_KEY = "bs.tableCollapsed";

const loadCollapsed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
  catch { return new Set(); }
};

function ConfirmBatchDeleteModal({ txs, onCancel, onConfirm }) {
  const undeletable = txs.filter(t => isSelf(t) || t.is_settlement || t.invoice_id);
  const deletable = txs.filter(t => !isSelf(t) && !t.is_settlement && !t.invoice_id);

  const totalExpense = deletable.filter(t => t.flow === "expense").reduce((s, t) => s + t.amount, 0);
  const totalIncome = deletable.filter(t => t.flow === "income").reduce((s, t) => s + t.amount, 0);

  return h(window.BS.Modal, {
    open: true, onClose: onCancel, title: `Excluir ${txs.length} ${txs.length === 1 ? "lançamento" : "lançamentos"}`, width: 480,
    footer: h("div", { className: "modal-footer-wrap" },
      h("div", { className: "modal-footer-meta" }),
      h("div", { className: "modal-footer-actions" },
        h("button", { className: "px-btn px-btn--ghost", onClick: onCancel, autoFocus: true }, "Cancelar"),
        h("button", {
          className: "px-btn px-btn--danger",
          onClick: () => onConfirm(deletable.map(t => t.id)),
          disabled: deletable.length === 0 || deletable.length > 20,
          style: { minWidth: 90 }
        }, `Excluir (${deletable.length})`)
      )
    )
  },
    h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      h("div", { className: "px-confirm-box" },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
          h("span", { style: { fontSize: 13, color: "var(--fg-0)", fontWeight: 600 } },
            `${deletable.length} ${deletable.length === 1 ? "lançamento a excluir" : "lançamentos a excluir"}`),
          h("span", { className: "mono", style: { fontSize: 13, fontWeight: 700, color: "var(--fg-0)" } },
            [totalExpense > 0 && `−${fmtBRL(totalExpense)}`, totalIncome > 0 && `+${fmtBRL(totalIncome)}`].filter(Boolean).join(" · ") || "R$ 0,00")
        )
      ),
      undeletable.length > 0 && h("div", { className: "px-alert px-alert--info" },
        h("span", null, "ⓘ"),
        h("span", null, `${undeletable.length} ${undeletable.length === 1 ? "lançamento foi ignorado" : "lançamentos foram ignorados"} por ser transferência pareada ou item de fatura.`)
      ),
      deletable.length > 20 && h("div", { className: "px-alert px-alert--info" },
        "Selecione até 20 lançamentos por exclusão."),
      h("div", { style: { fontSize: 12, color: "var(--fg-3)" } }, "Esta ação não pode ser desfeita.")
    )
  );
}

function TxTableWidget({ monthSel, refreshKey, onEditCategory, openBulk, onBulkConsumed, monthTx, setMonthTx,
                         filter, setFilterField, onToggleFacet, onClearFilter, accounts, catsIndex, isLatestMonth }) {
  const [bulkGroups, setBulkGroups] = _s2St([]);
  const [bulkOpen, setBulkOpen] = _s2St(false);
  const [bulkFlow, setBulkFlow] = _s2St("expense");
  const [lifetimeOpen, setLifetimeOpen] = _s2St(false);
  //> Uma vez só: o total da vida não muda com o mês selecionado.
  const [lifetime, setLifetime] = _s2St(null);
  _s2Ef(() => { fetchLifetime().then(setLifetime).catch(() => {}); }, []);
  const [sort, setSort] = _s2St({ key: "date", dir: -1 });
  const [catsByFlow, setCatsByFlow] = _s2St({ expense: [], income: [] });
  const [grouped, setGrouped] = _s2St(true);
  const [collapsed, setCollapsed] = _s2St(loadCollapsed);
  const [selectedIds, setSelectedIds] = _s2St(new Set());
  const [lastSelectedTx, setLastSelectedTx] = _s2St(null);
  const [batchDeleteModal, setBatchDeleteModal] = _s2St(false);

  _s2Ef(() => {
    setSelectedIds(new Set());
    setLastSelectedTx(null);
  }, [monthSel]);

  _s2Ef(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds]);

  _s2Ef(() => {
    Promise.all([fetchCategoriesFull("expense"), fetchCategoriesFull("income")])
      .then(([exp, inc]) => setCatsByFlow({ expense: exp, income: inc }));
  }, [refreshKey]);

  _s2Ef(() => {
    if (!monthSel) return;
    const { month, year } = monthSel;
    fetchUncategorizedMerchants({ year, month }).then(setBulkGroups).catch(() => setBulkGroups([]));
  }, [monthSel, refreshKey]);

  _s2Ef(() => {
    if (openBulk) {
      if (typeof openBulk === "string") setBulkFlow(openBulk);
      setBulkOpen(true);
      onBulkConsumed && onBulkConsumed();
    }
  }, [openBulk]);

  _s2Ef(() => {
    const handler = e => setMonthTx(prev => prev.filter(tx => tx.id !== e.detail.id));
    window.addEventListener("bs-tx-optimistic-delete", handler);
    return () => window.removeEventListener("bs-tx-optimistic-delete", handler);
  }, []);

  const toggleCollapse = _s2Cb((key) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const applyBulk = async (group, categoryId) => {
    const list = catsByFlow[group.flow] || [];
    const catName = list.find(c => c.id === categoryId)?.name || "";
    await categorizeBulk(group.ids, categoryId);
    setBulkGroups(prev => prev.filter(g => !(g.merchant_key === group.merchant_key && g.flow === group.flow)));
    if (setMonthTx) {
      setMonthTx(prev => prev.map(tx => group.ids.includes(tx.id) ? { ...tx, category_id: categoryId, category: catName } : tx));
    }
    return {

      undo: async () => {
        await Promise.all(group.ids.map(id => patchTransactionCategory(id, null)));
        setBulkGroups(prev => [...prev, group]);
        if (setMonthTx) {
          setMonthTx(prev => prev.map(tx => group.ids.includes(tx.id) ? { ...tx, category_id: null, category: null } : tx));
        }
      },
    };
  };

  const monthLabel = monthSel ? `${PT_MONTHS[monthSel.month]} ${monthSel.year}` : "";

  const bankOf = (t) => window.BS.bankLabel(t.bank, t.account_id);

  const filteredTx = _s2Memo(() => monthTx.filter(t => {
    const norm = {
      flow: t.flow, method: t.method, category: t.category || "Sem categoria", account_id: t.account_id,
      bank: bankOf(t),
      label: [t.display_name, window.BS.prettifyDesc(t.description), t.description].filter(Boolean).join(" "),
    };
    return window.BS.matchesFilter(norm, filter);
  }), [monthTx, filter]);

  const sortedTx = _s2Memo(() => {
    const key = SORT_KEYS[sort.key] || SORT_KEYS.date;
    return [...filteredTx].sort((a, b) => {
      const ka = key(a), kb = key(b);
      const cmp = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb), "pt-BR");
      return (cmp || (a.id - b.id)) * sort.dir;
    });
  }, [filteredTx, sort]);

  const groups = _s2Memo(
    () => grouped ? window.BS.buildGroups(sortedTx, catsIndex) : [],
    [grouped, sortedTx, catsIndex],
  );

  const singleAccount = filter.accounts.size === 1 ? [...filter.accounts][0] : null;
  const showBalance = !grouped && !!singleAccount && sort.key === "date" && !!isLatestMonth;

  const balanceById = _s2Memo(() => {
    if (!showBalance) return null;
    const acct = (accounts || []).find(a => a.id === singleAccount);
    if (!acct || acct.balance == null) return null;
    const chrono = monthTx
      .filter(t => t.account_id === singleAccount)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const map = new Map();
    let bal = acct.balance;
    for (let i = chrono.length - 1; i >= 0; i--) {
      map.set(chrono[i].id, bal);
      bal += (chrono[i].flow === "expense" ? chrono[i].amount : -chrono[i].amount);
    }
    return map;
  }, [showBalance, singleAccount, accounts, monthTx]);

  const toggleSort = key =>
    setSort(prev => prev.key === key ? { key, dir: -prev.dir } : { key, dir: key === "date" || key === "amount" ? -1 : 1 });

  const filtExp = filteredTx.filter(isConsumptionExpense).reduce((s, t) => s + t.amount, 0);
  const filtInc = filteredTx.filter(isRevenue).reduce((s, t) => s + t.amount, 0);

  const filtInv = filteredTx.filter(isInvest)
    .reduce((s, t) => s + (t.flow === "expense" ? t.amount : -t.amount), 0);
  const hasFilter = window.BS.facetCount(filter) > 0;

  const selectableTx = _s2Memo(
    () => sortedTx.filter(t => window.BS.moneyKind(t) !== window.BS.KIND.FORECAST),
    [sortedTx]
  );
  const allVisibleSelected = selectableTx.length > 0 && selectableTx.every(t => selectedIds.has(t.id));
  const someVisibleSelected = selectableTx.some(t => selectedIds.has(t.id));

  const toggleSelect = _s2Cb((t, e) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const isShift = e && (e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey));
      if (isShift && lastSelectedTx) {
        const idxA = sortedTx.findIndex(x => x.id === lastSelectedTx.id);
        const idxB = sortedTx.findIndex(x => x.id === t.id);
        if (idxA !== -1 && idxB !== -1) {
          const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
          for (let i = start; i <= end; i++) {
            if (window.BS.moneyKind(sortedTx[i]) !== window.BS.KIND.FORECAST) {
              next.add(sortedTx[i].id);
            }
          }
          return next;
        }
      }
      if (next.has(t.id)) {
        next.delete(t.id);
      } else {
        next.add(t.id);
      }
      return next;
    });
    setLastSelectedTx(t);
  }, [lastSelectedTx, sortedTx]);

  const toggleSelectAll = _s2Cb(() => {
    if (!selectableTx.length) return;
    setSelectedIds(prev => {
      const allSelected = selectableTx.every(t => prev.has(t.id));
      if (allSelected) {
        return new Set();
      }
      return new Set(selectableTx.map(t => t.id));
    });
  }, [selectableTx]);

  const toggleSelectGroup = _s2Cb((group) => {
    const groupSelectable = group.txs.filter(t => window.BS.moneyKind(t) !== window.BS.KIND.FORECAST);
    if (!groupSelectable.length) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = groupSelectable.every(t => next.has(t.id));
      if (allSelected) {
        groupSelectable.forEach(t => next.delete(t.id));
      } else {
        groupSelectable.forEach(t => next.add(t.id));
      }
      return next;
    });
  }, []);

  const clearSelection = _s2Cb(() => {
    setSelectedIds(new Set());
    setLastSelectedTx(null);
  }, []);

  const selectedTxs = _s2Memo(() => {
    if (selectedIds.size === 0) return [];
    return monthTx.filter(t => selectedIds.has(t.id));
  }, [selectedIds, monthTx]);

  const { selectedSum, selectedIncome, selectedExpense } = _s2Memo(() => {
    let inc = 0, exp = 0;
    selectedTxs.forEach(t => {
      if (t.flow === "income") inc += t.amount;
      else exp += t.amount;
    });
    return {
      selectedSum: inc - exp,
      selectedIncome: inc,
      selectedExpense: exp,
    };
  }, [selectedTxs]);

  const handleBulkCategorize = async (categoryId) => {
    if (selectedIds.size === 0) return;
    try {
      if (categoryId === null) {
        const ids = [...selectedIds];
        await window.BS.categorizeBulk(ids, null);
        if (setMonthTx) {
          setMonthTx(prev => prev.map(t => ids.includes(t.id) ? { ...t, category_id: null, category: null } : t));
        }
        window.dispatchEvent(new CustomEvent("bs-toast", {
          detail: { msg: `${ids.length} ${ids.length === 1 ? "lançamento sem categoria" : "lançamentos sem categoria"}`, kind: "success" }
        }));
        setSelectedIds(new Set());
      } else {
        const allCats = [...(catsByFlow.expense || []), ...(catsByFlow.income || [])];
        const cat = allCats.find(c => c.id === categoryId);
        if (!cat) return;
        const catName = cat.name;
        const matchingTxs = selectedTxs.filter(t => t.flow === cat.flow);
        const matchingIds = matchingTxs.map(t => t.id);

        if (matchingIds.length === 0) {
          window.dispatchEvent(new CustomEvent("bs-toast", {
            detail: { msg: `Nenhum lançamento de ${cat.flow === "expense" ? "gasto" : "entrada"} selecionado para esta categoria.`, kind: "warn" }
          }));
          return;
        }

        await window.BS.categorizeBulk(matchingIds, categoryId);
        if (setMonthTx) {
          setMonthTx(prev => prev.map(t => matchingIds.includes(t.id) ? { ...t, category_id: categoryId, category: catName } : t));
        }

        const skipped = selectedTxs.length - matchingIds.length;
        const msg = skipped > 0
          ? `${matchingIds.length} ${matchingIds.length === 1 ? (cat.flow === "expense" ? "gasto categorizado" : "entrada categorizada") : (cat.flow === "expense" ? "gastos categorizados" : "entradas categorizadas")} como "${catName}" (${skipped} ignorados por fluxo diferente)`
          : `${matchingIds.length} ${matchingIds.length === 1 ? "lançamento categorizado" : "lançamentos categorizados"} como "${catName}"`;

        window.dispatchEvent(new CustomEvent("bs-toast", {
          detail: { msg, kind: "success" }
        }));
        setSelectedIds(new Set());
      }
      window.dispatchEvent(new CustomEvent("bs-refresh"));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("bs-toast", {
        detail: { msg: e.message || "Erro ao categorizar lançamentos.", kind: "error" }
      }));
    }
  };

  const handleBatchDelete = async (ids) => {
    setBatchDeleteModal(false);
    if (!ids || !ids.length) return;
    try {
      await window.BS.deleteTransactions(ids);
      const idSet = new Set(ids);
      if (setMonthTx) {
        setMonthTx(prev => prev.filter(t => !idSet.has(t.id)));
      }
      setSelectedIds(new Set());
      ids.forEach(id => {
        window.dispatchEvent(new CustomEvent("bs-tx-optimistic-delete", { detail: { id } }));
      });
      window.dispatchEvent(new CustomEvent("bs-toast", {
        detail: { msg: `${ids.length} ${ids.length === 1 ? "lançamento excluído" : "lançamentos excluídos"}`, kind: "success" }
      }));
      window.dispatchEvent(new CustomEvent("bs-refresh"));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("bs-toast", {
        detail: { msg: e.message || "Erro ao excluir lançamentos.", kind: "error" }
      }));
    }
  };

  const Th = (key, label, style) => h("th", {
    className: "sortable", style,
    onClick: () => toggleSort(key),
    "aria-sort": sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : "none",
  }, label, sort.key === key && h("span", { className: "sort-ind" }, sort.dir > 0 ? "▲" : "▼"));

  const cols = ["select", "date", "desc", "cat", "account", "method", "amount"];
  if (showBalance) cols.push("balance");
  const colSpan = cols.length;

  const rowFor = (t, g) => h(window.BS.TxRow, {
    key: t.id, t, cols,
    amountSize: g ? window.BS.scaleFor(t.amount, g.maxAmount) : undefined,
    runningBalance: balanceById ? balanceById.get(t.id) : undefined,
    onEditCategory,
    catsByFlow,
    isSelected: selectedIds.has(t.id),
    onToggleSelect: toggleSelect,
    onInlineCategory: async (tx, categoryId) => {
      const list = catsByFlow[tx.flow] || [];
      const catName = list.find(c => c.id === categoryId)?.name || "";
      try {
        await patchTransactionCategory(tx.id, categoryId);
        setMonthTx(prev => prev.map(x => x.id === tx.id ? { ...x, category_id: categoryId, category: catName } : x));
        window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: `Categoria: ${catName}`, kind: "success" } }));
      } catch (e) {
        window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: "Erro ao categorizar", kind: "error" } }));
      }
    },

    onApplySuggestion: async (tx) => {
      try {
        await patchTransactionCategory(tx.id, tx.suggested_category_id);
        window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: `Categorizado como ${tx.suggested_category_name}`, kind: "success" } }));
        setMonthTx(prev => prev.map(x => x.id === tx.id
          ? { ...x, category_id: tx.suggested_category_id, category: tx.suggested_category_name }
          : x));
      } catch (e) {
        window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg: "Erro ao atualizar", kind: "error" } }));
      }
    }
  });

  return h("div", { className: "widget table-widget" },

    h("div", { className: "table-toolbar" },
      h("span", { className: "widget-title" }, "Lançamentos"),
      h("span", { className: "mono", style: { fontSize: 10, color: "var(--fg-3)", marginRight: 2 } },
        hasFilter ? `${sortedTx.length} de ${monthTx.length}` : `${monthTx.length}`),
      h(window.BS.FilterBar, {
        filter,
        onRemove: (kind, value) => {
          if (kind === "search") setFilterField("search", "");
          else if (kind === "flow" || kind === "method") setFilterField(kind, "all");
          else onToggleFacet(kind, value);
        },
        onClear: onClearFilter || (() => {
          if (setFilterField) {
            setFilterField("flow", "all");
            setFilterField("method", "all");
            setFilterField("search", "");
          }
        }),
      }),
      h("div", { className: "table-toolbar-spacer" }),
      h("div", { className: "px-seg" },
        h("button", {
          className: `px-seg-btn${grouped ? " active" : ""}`,
          onClick: () => setGrouped(g => !g),
          "data-tip": grouped
            ? "Agrupado por categoria. desagrupe para ver em ordem cronológica (e o saldo da conta, com uma conta selecionada)."
            : "Lista corrida. agrupe para ver totais e alvo por categoria.",
        }, grouped ? "Agrupado" : "Lista corrida")
      ),
      h("div", { className: "px-seg" },
        [["all", "Tudo"], ["expense", "Despesas"], ["income", "Receitas"]].map(([k, l]) =>
          h("button", { key: k, className: `px-seg-btn${filter.flow === k ? " active" : ""}`,
            onClick: () => { setFilterField("flow", k); if (k === "income") setFilterField("method", "all"); } }, l))
      ),
      h("div", { className: "px-seg table-method-seg" },
        [["all", "Todos"], ["pix", "PIX"], ["credit", "Crédito"], ["ted", "TED"]].map(([k, l]) =>
          h("button", { key: k, className: `px-seg-btn${filter.method === k ? " active" : ""}`,
            onClick: () => setFilterField("method", k) }, l))
      ),
      h("input", {
        value: filter.search, onChange: e => setFilterField("search", e.target.value),
        placeholder: "Buscar lançamento…", className: "table-search-input",
        autoComplete: "off", spellCheck: false,
      })
    ),
    selectedIds.size > 0 && h("div", { className: "table-bulk-bar" },
      h("div", { className: "table-bulk-info" },
        h("span", { className: "table-bulk-badge" },
          `${selectedIds.size} ${selectedIds.size === 1 ? "selecionado" : "selecionados"}`),
        h("span", { className: "table-bulk-sum mono" },
          "Soma: ",
          h("strong", { style: { color: selectedSum >= 0 ? "var(--pos)" : "var(--neg)" } },
            (selectedSum >= 0 ? "+" : "−") + fmtBRL(Math.abs(selectedSum)))
        ),
        selectedTxs.length > 1 && (selectedIncome > 0 && selectedExpense > 0) && h("span", {
          className: "table-bulk-breakdown mono",
          style: { fontSize: 11, color: "var(--fg-3)" }
        }, `(+${fmtBRL(selectedIncome)} · −${fmtBRL(selectedExpense)})`)
      ),
      h("div", { className: "table-bulk-actions" },
        h("select", {
          disabled: true, className: "px-select",
          style: {
            height: 24, fontSize: 11, padding: "0 6px",
            background: "var(--bg-1)", border: "1px solid var(--line-2)",
            color: "var(--fg-0)", cursor: "pointer"
          },
          defaultValue: "",
          onChange: async (e) => {
            const val = e.target.value;
            if (!val) return;
            const catId = val === "clear" ? null : parseInt(val, 10);
            await handleBulkCategorize(catId);
            e.target.value = "";
          }
        },
          h("option", { value: "" },
            (selectedExpense > 0 && selectedIncome === 0)
              ? "Categorizar gastos selecionados em…"
              : (selectedIncome > 0 && selectedExpense === 0)
                ? "Categorizar entradas selecionadas em…"
                : "Categorizar selecionados em…"),
          h("option", { value: "clear" }, "— Sem categoria —"),
          (selectedIncome === 0 || selectedExpense > 0) && h("optgroup", { label: "Categorias de Gastos" },
            (catsByFlow.expense || []).map(c => h("option", { key: c.id, value: c.id }, c.name))
          ),
          (selectedExpense === 0 || selectedIncome > 0) && h("optgroup", { label: "Categorias de Entrada" },
            (catsByFlow.income || []).map(c => h("option", { key: c.id, value: c.id }, c.name))
          )
        ),
        h("button", {
          className: "px-btn px-btn--danger px-btn--sm",
          onClick: () => setBatchDeleteModal(true),
          disabled: true, "data-tip": "Somente leitura na demonstração",
        }, `Excluir (${selectedIds.size})`),
        h("button", {
          className: "px-btn px-btn--ghost px-btn--sm",
          onClick: clearSelection,
          "data-tip": "Desmarcar todos os selecionados (Esc)",
        }, "Desmarcar")
      )
    ),

    h("div", { className: "table-scroll" },
      h("table", { className: "grid-table" },
        h("thead", null, h("tr", null,
          h("th", { style: { width: 34, textAlign: "center", padding: "6px 4px 6px 10px" } },
            h("input", {
              type: "checkbox",
              className: "tx-checkbox",
              checked: allVisibleSelected,
              ref: el => {
                if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
              },
              onChange: toggleSelectAll,
              "data-tip": allVisibleSelected
                ? "Desmarcar todos os visíveis"
                : "Selecionar todos os visíveis",
              "aria-label": "Selecionar todos os visíveis",
            })
          ),
          Th("date", "Data", { width: 70 }),
          Th("desc", "Descrição"),
          Th("cat", "Categoria", { width: 150 }),
          Th("account", "Conta", { width: 90 }),
          Th("method", "Método", { width: 80 }),
          Th("amount", "Valor", { textAlign: "right", width: 130 }),
          showBalance && h("th", { style: { textAlign: "right", width: 100 }, "data-tip": "Saldo da conta após o lançamento" }, "Saldo")
        )),
        h("tbody", null,
          sortedTx.length === 0 && h("tr", null, h("td", { colSpan, style: { textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 13 } },
            monthTx.length === 0 ? "Nenhum lançamento neste mês." : "Nenhum lançamento com esses filtros.")),

          ...(grouped
            ? groups.flatMap(g => {
                const isOpen = !collapsed.has(g.key);
                const realTxs = g.txs.filter(t => window.BS.moneyKind(t) !== window.BS.KIND.FORECAST);
                const groupAllSelected = realTxs.length > 0 && realTxs.every(t => selectedIds.has(t.id));
                const groupSomeSelected = realTxs.some(t => selectedIds.has(t.id));
                const rows = [h(GroupHeader, {
                  key: g.key, g, isOpen, colSpan,
                  onToggle: () => toggleCollapse(g.key),
                  onFacet: g.isCat && onToggleFacet ? () => onToggleFacet("categories", g.label) : null,
                  isSelected: groupAllSelected,
                  isIndeterminate: groupSomeSelected && !groupAllSelected,
                  onToggleSelect: realTxs.length > 0 ? () => toggleSelectGroup(g) : null,
                })];
                if (isOpen) g.txs.forEach(t => rows.push(rowFor(t, g)));
                return rows;
              })
            : sortedTx.map(t => rowFor(t, null)))
        )
      )
    ),

    //> Investido primeiro: é o único que NÃO entra na conta do saldo.
    h("div", { className: "table-totals" },
      h("div", { className: "table-totals-group" },
        h("div", { className: "table-total-item table-total-item--invest", "data-tip": "Aplicações menos resgates. Fora do saldo: investir não é gastar nem ganhar." },
          h("span", { className: "table-total-dot", style: { background: "var(--reserve)" } }),
          h("span", { className: "table-total-label" }, "Investido"),
          h(window.BS.Money, { value: Math.abs(filtInv), kind: "invest", emphasis: true, t: { flow: filtInv >= 0 ? "expense" : "income" } })
        ),
        h("div", { className: "table-total-item table-total-item--inc" },
          h("span", { className: "table-total-dot", style: { background: "var(--pos)" } }),
          h("span", { className: "table-total-label" }, "Receitas"),
          h(window.BS.Money, { value: filtInc, kind: "revenue", emphasis: true, t: { flow: "income" } })
        ),
        h("div", { className: "table-total-item table-total-item--exp" },
          h("span", { className: "table-total-dot", style: { background: "var(--neg)" } }),
          h("span", { className: "table-total-label" }, "Despesas"),
          h(window.BS.Money, { value: filtExp, kind: "expense", emphasis: true, t: { flow: "expense" } })
        ),
        h("div", { className: "table-total-item table-total-item--saldo" },
          h("span", { className: "table-total-dot", style: { background: (filtInc - filtExp) >= 0 ? "var(--pos)" : "var(--neg)" } }),
          h("span", { className: "table-total-label" }, "Saldo"),
          h(window.BS.Money, {
            value: Math.abs(filtInc - filtExp), emphasis: true,
            kind: (filtInc - filtExp) >= 0 ? "revenue" : "expense",
            t: { flow: (filtInc - filtExp) >= 0 ? "income" : "expense" },
          })
        )
      ),
      lifetime && h("button", {
        className: "table-lifetime",
        onClick: () => setLifetimeOpen(true),
        "data-tip": `Total histórico desde ${window.BS.fullDateBR(lifetime.first_date)} (clique para abrir).`,
      },
        h("span", { className: "table-lifetime-k" }, "Desde o começo"),
        h("span", { className: "mono table-lifetime-v", style: { color: "var(--pos)" } },
          "+" + window.BS.fmtBRL(lifetime.earned)),
        h("span", { className: "mono table-lifetime-v", style: { color: "var(--neg)" } },
          "−" + window.BS.fmtBRL(lifetime.spent)),
        h("span", { className: "table-lifetime-seta" }, "→"),
      )
    ),

    lifetimeOpen && h(window.BS.LifetimePanel, { onClose: () => setLifetimeOpen(false) }),

    bulkOpen && h(window.BS.BulkCategorizeModal, {
      groups: bulkGroups, catsByFlow, monthLabel, onApply: applyBulk, onClose: () => setBulkOpen(false),
      initialFlow: bulkFlow,
      onRefreshCats: async () => {
        const [exp, inc] = await Promise.all([fetchCategoriesFull("expense"), fetchCategoriesFull("income")]);
        setCatsByFlow({ expense: exp, income: inc });
        return { expense: exp, income: inc };
      },
      onToast: (msg, kind, action) =>
        window.dispatchEvent(new CustomEvent("bs-toast", { detail: { msg, kind, action } })),
    }),
    batchDeleteModal && h(ConfirmBatchDeleteModal, {
      txs: selectedTxs,
      onCancel: () => setBatchDeleteModal(false),
      onConfirm: handleBatchDelete,
    })
  );
}

function GroupHeader({ g, isOpen, colSpan, onToggle, onFacet, isSelected, isIndeterminate, onToggleSelect }) {
  const st = window.BS.budgetState(g.total, g.budget);
  const delta = window.BS.groupDelta(g);
  const color = window.BS.KIND_COLOR[g.kind];

  return h("tr", { className: "group-header" },
    h("td", { colSpan, onClick: onToggle, style: { cursor: "pointer" } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 10, width: "100%" } },
        onToggleSelect && h("input", {
          type: "checkbox",
          className: "tx-checkbox",
          checked: !!isSelected,
          ref: el => { if (el) el.indeterminate = !!isIndeterminate; },
          onClick: e => e.stopPropagation(),
          onChange: e => { e.stopPropagation(); onToggleSelect(g, e); },
          "data-tip": isSelected ? "Desmarcar este grupo" : "Selecionar todos deste grupo",
          "aria-label": `Selecionar grupo ${g.label}`,
        }),
        h("span", { className: "mono", style: { color: "var(--fg-1)", fontSize: 11, width: 8, fontWeight: 700 } }, isOpen ? "▾" : "▸"),
        h("span", {
          style: { fontWeight: 700, fontSize: 12, color: g.isCat ? "var(--fg-0)" : color,
            cursor: onFacet ? "pointer" : "inherit" },
          onClick: onFacet ? (e => { e.stopPropagation(); onFacet(); }) : undefined,
          "data-tip": !g.isCat ? (window.BS.KIND_HINT[g.kind] || undefined) : undefined,
        }, g.label),
        h("span", { className: "mono", style: { fontSize: 11, color: "var(--fg-2)", fontWeight: 600 } }, `${g.count}`),

        g.isCat
          ? h(window.BS.Money, { value: g.total, kind: g.kind, emphasis: true,
              t: { flow: g.kind === "revenue" ? "income" : "expense" } })
          : h(window.BS.Money, {
              value: Math.abs(g.net), kind: g.kind, emphasis: true,
              t: { flow: g.net >= 0 ? "expense" : "income" },
              "data-tip": g.net === 0
                ? "As pernas se cancelam. o dinheiro apenas mudou de conta, não saiu."
                : window.BS.KIND_HINT[g.kind],
            }),

        st && h("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 160 } },
          h("div", { style: { flex: 1, height: 6, background: "var(--bg-2)", border: "1px solid var(--line-1)", minWidth: 60 } },
            h("div", { style: { width: `${Math.min(100, st.ratio * 100)}%`, height: "100%", background: st.color } })
          ),
          h("span", { className: "mono", style: { fontSize: 11, color: st.color, fontWeight: 700 },
            "data-tip": `Alvo ${g.budgetSource === "month" ? "deste mês" : "fixo"}: ${fmtBRL(g.budget)}.` },
            `${Math.round(st.ratio * 100)}%`)
        ),
        g.isCat && g.kind === "expense" && !st && h("span", { style: { fontSize: 11, color: "var(--fg-2)" } }, "Sem alvo"),

        delta != null && h("span", {
          className: "mono",
          style: { fontSize: 11, color: delta > 0 ? "var(--neg)" : "var(--fg-2)", marginLeft: "auto", fontWeight: 600 },
          "data-tip": `Mês anterior: ${fmtBRL(g.prevSpent)}.`,
        }, `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}% em relação ao mês anterior`)
      )
    )
  );
}

window.BS = window.BS || {};
Object.assign(window.BS, { TxTableWidget });

})();
