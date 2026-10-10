(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const {
  fmtBRL, fmtDateBR, fullDateBR, Modal, useToasts, BankChip, BrokerSharkLogo,
  PT_MONTHS, PT_SHORT,
  DashboardView,
  CategoriesPanel,
  ImportModal,
  isSelf, isInvest,
} = window.BS;

function ConfirmDeleteModal({ tx, onCancel, onConfirm }) {
  const desc = tx.display_name || window.BS.prettifyDesc(tx.description) || "";
  const _self = isSelf(tx);

  const warnings = [];
  if (_self) warnings.push("Transferências pareadas têm exclusão bloqueada para preservar o vínculo.");

  return h(Modal, {
    open: true, onClose: onCancel, title: "Excluir lançamento", width: 440,
    footer: h("div", { className: "modal-footer-wrap" },
      h("div", { className: "modal-footer-meta" }),
      h("div", { className: "modal-footer-actions" },
        h("button", { className: "px-btn px-btn--ghost", onClick: onCancel, autoFocus: true }, "Cancelar"),
        h("button", {
          className: "px-btn px-btn--danger",
          onClick: onConfirm,
          style: { minWidth: 90 }
        }, "Excluir")
      )
    )
  },
    h("div", { className: "px-confirm-box" },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 } },
        h("span", { style: { fontSize: 13, color: "var(--fg-0)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, desc),
        h("span", { className: "mono", style: { fontSize: 14, fontWeight: 700, color: tx.flow === "expense" ? "var(--neg)" : "var(--pos)", flexShrink: 0 } },
          (tx.flow === "expense" ? "−" : "+") + fmtBRL(tx.amount))
      ),
      h("div", { style: { fontSize: 11, color: "var(--fg-3)", marginTop: 4 } }, fmtDateBR(tx.date))
    ),
    warnings.map((w, i) => h("div", { key: i, className: "px-alert px-alert--info" },
      h("span", null, "ⓘ"), h("span", null, w))),
    h("div", { style: { fontSize: 12, color: "var(--fg-3)", marginTop: 8 } }, "Esta ação não pode ser desfeita.")
  );
}

function MonthNav({ monthly, monthSel, onPick }) {
  //> Navega sobre os meses NAVEGÁVEIS, não sobre os que têm dado: parar no último
  //> import tirava o futuro da tela, e é lá que mora o planejamento.
  const nav = window.BS.navigableMonths(monthly, window.BS.todayISO());
  if (!nav.length || !monthSel) return null;
  const idx = nav.findIndex(m => m.year === monthSel.year && m.month === monthSel.month);
  const isLatest = idx === nav.length - 1;
  const pick = i => { const m = nav[i]; if (m) onPick({ year: m.year, month: m.month }); };

  return h("div", { className: "month-nav", role: "group", "aria-label": "Mês analisado" },
    h("button", { className: "month-nav-btn", disabled: idx <= 0, onClick: () => pick(idx - 1), "data-tip": "Mês anterior", "aria-label": "Mês anterior" }, "‹"),
    h("span", { className: "month-nav-label" }, `${PT_MONTHS[monthSel.month]} ${monthSel.year}`),
    h("button", { className: "month-nav-btn", disabled: idx < 0 || isLatest, onClick: () => pick(idx + 1), "data-tip": "Próximo mês", "aria-label": "Próximo mês" }, "›")
  );
}

// Espaço unificado de status no topo da tela:
// Mostra a situação dos lançamentos do ledger (em dia, meses sem dados ou vazio).
// Telemetria pura de cockpit. sem navegação redundante (o botão Importar já existe na barra).
function LedgerHud({ status }) {
  if (!status) return null;
  if (status.demo) return h("div", {className:"hud"}, h("span", {className:"hud-status hud-status--ok"}, h("span", {className:"hud-led", style:{background:"var(--pos)"}}), "DADOS FICTÍCIOS"));

  const lag = window.BS.ledgerLag(status.last_tx_date ?? null, window.BS.todayISO());
  const atrasado = lag.level !== "ok";

  const dadosTexto = lag.level === "empty" ? "SEM DADOS"
    : atrasado ? `${lag.months} ${lag.months === 1 ? "MÊS" : "MESES"} SEM DADOS`
    : `DADOS ATÉ ${fmtDateBR(status.last_tx_date)}`;

  const dadosDica = lag.level === "empty"
    ? "Nenhum lançamento no ledger."
    : atrasado
      ? `${lag.label}. O ledger vai até ${fullDateBR(status.last_tx_date)}.`
      : `Ledger em dia. Lançamento mais recente: ${fullDateBR(status.last_tx_date)}.`;

  const statusClass = lag.level === "empty"
    ? "hud-status--empty"
    : atrasado
      ? `hud-status--alerta hud-status--${lag.level}`
      : "hud-status--ok";

  const ledColor = lag.level === "empty"
    ? "var(--neg)"
    : atrasado
      ? "var(--warn)"
      : "var(--pos)";

  return h("div", { className: "hud" },
    h("div", {
      className: `hud-status ${statusClass}`,
      "data-tip": dadosDica,
      "aria-label": dadosTexto,
    },
      h("span", { className: "hud-led", style: { background: ledColor } }),
      h("span", { className: "hud-text" }, dadosTexto)
    )
  );
}

function App() {
  const [editTx, setEditTx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [monthly, setMonthly] = useState([]);
  const [monthSel, setMonthSel] = useState(null);
  const [ledgerStatus, setLedgerStatus] = useState(null);
  //> As cores vivem fora do React (domain/bank.js): este tick repinta quando chegam.
  const [, setColorTick] = useState(0);
  const { push, Toaster } = useToasts();

  useEffect(() => {
    fetchMonthlyFull().then(data => {
      setMonthly(data);
      setMonthSel(prev => {
        if (prev) return prev;
        const today = new Date();
        const curY = today.getFullYear();
        const curM = today.getMonth() + 1;
        const withTx = data.filter(d => (d.income > 0 || d.expenses > 0));
        const curInTx = withTx.find(d => d.year === curY && d.month === curM);
        const target = curInTx || withTx[withTx.length - 1] || data.find(d => d.year === curY && d.month === curM) || { year: curY, month: curM };
        return { year: target.year, month: target.month };
      });
    }).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    fetchAccounts().then(accs => {
      window.BS.accountNames = Object.fromEntries(accs.map(a => [a.id, a.name]));
      const colors = Object.fromEntries(
        accs.filter(a => a.bank_color).map(a => [a.bank, a.bank_color])
      );
      window.BS.setBankColors(colors);
      if (Object.keys(colors).length) setColorTick(t => t + 1);
    }).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    fetchBackupStatus().then(setLedgerStatus).catch(() => {});
  }, [refreshKey]);

  //> O chip informa quem olha; o toast alcança quem não olhou.
  const backupWarned = useRef(false);
  useEffect(() => {
    if (!ledgerStatus || ledgerStatus.demo || ledgerStatus.exists == null || backupWarned.current) return;
    const dias = Math.floor((ledgerStatus.age_seconds || 0) / 86400);
    if (!ledgerStatus.exists) {
      backupWarned.current = true;
      push("Nenhum backup encontrado. Seu ledger existe num arquivo só.", "error");
    } else if (dias > 40) {
      backupWarned.current = true;
      push(`Último backup há ${dias} dias.`, "info");
    }
  }, [ledgerStatus, push]);

  useEffect(() => { window.BS.juice.boot(document.getElementById("app")); }, []);
  useEffect(() => {
    const onRefresh = () => setRefreshKey(k => k + 1);
    window.addEventListener("bs-refresh", onRefresh);
    return () => window.removeEventListener("bs-refresh", onRefresh);
  }, []);

  async function handleDeleteTx(id) {
    try {
      const res = await deleteTransaction(id);
      setRefreshKey(k => k + 1);
      const n = res?.deleted || 1;
      push(n > 1 ? `${n} lançamentos excluídos` : "Lançamento excluído", "success");
    } catch (e) {
      push(e.message || "Erro ao excluir lançamento.", "error");
    }
  }

  return h("div", { id: "app", className: "app-root" },

    h("header", { className: "v3-topbar" },
      h(BrokerSharkLogo, { size: 24 }),
      h(MonthNav, { monthly, monthSel, onPick: setMonthSel }),
      h("div", { className: "topbar-spacer" }),
      h(LedgerHud, { status: ledgerStatus }),
      h("div", { className: "topbar-actions" },
        h("button", {
          className: "topbar-icon-btn",
          onClick: () => setSettingsOpen(true),
          "data-tip": "Configurações",
          "aria-label": "Configurações",
        }, "⚙"),
        h("button", {
          className: "topbar-icon-btn",
          onClick: () => { clearCache(); setRefreshKey(k => k + 1); },
          "data-tip": "Atualizar dados",
          "aria-label": "Atualizar dados",
        }, h(window.BS.IconRefresh, { size: 14 })),
        h("a", {
          className: "topbar-icon-btn",
          href: "#",
          onClick: event => { event.preventDefault(); push("A vitrine não acessa nem exporta backups pessoais.", "info"); },
          "data-tip": "Backup indisponível na demonstração",
          "aria-label": "Baixar backup",
        }, h(window.BS.IconBackup, { size: 14 })),
        h("button", {
          className: "px-btn px-btn--primary topbar-btn topbar-btn--import",
          onClick: () => setImportOpen(true),
        },
          h(window.BS.IconImport, { size: 14 }),
          h("span", { className: "topbar-btn-text" }, "Importar")
        ),
      ),
    ),

    h("div", {className:"demo-banner", role:"note"}, "Demonstração com dados fictícios. Explore os meses, filtros e detalhes. Alterações e importações estão desativadas."),

    h(DashboardView, {
      monthSel, monthly, onPickMonth: setMonthSel, refreshKey,
      onEditCategory: setEditTx,
      onImport: () => setImportOpen(true),
      onManageCategories: () => setCategoriesOpen(true),
      onManageAccounts: () => setAccountsOpen(true),
      onOpenPosition: (ids, name) => setPosition({ ids, name, month: monthSel }),
    }),

    importOpen && h(ImportModal, {
      onClose: () => setImportOpen(false),
      onDone: (res) => {
        setImportOpen(false);
        const n = res?.inserted ?? 0;
        const msg = res?.kind === "b3"
          ? (n > 0 ? `${n} ${n === 1 ? "medição B3 nova ou alterada" : "medições B3 novas ou alteradas"}` : "Nenhuma medição B3 nova")
          : res?.kind === "all"
            ? `${n} novos lançamentos, ${res.positionsChanged || 0} medições B3 novas ou alteradas`
            : (n > 0 ? `${n} ${n === 1 ? "lançamento importado" : "lançamentos importados"}` : "Nada novo para importar");

        const undo = (res?.kind === "tx" && res?.importBatchId && n > 0)
          ? {
              label: "Desfazer",
              onClick: async () => {
                try {
                  const r = await deleteImportBatch(res.importBatchId);
                  push(`Importação revertida (${r.deleted} ${r.deleted === 1 ? "lançamento" : "lançamentos"})`, "info");
                } catch (e) {
                  push(e.message || "Não foi possível reverter.", "error");
                }
                setRefreshKey(k => k + 1);
              },
            }
          : null;
        push(msg, n > 0 || res?.positionsChanged > 0 ? "success" : "info", undo);
        if (res?.kind === "tx" && n > 0) window.BS.juice.coinDrop();
        setRefreshKey(k => k + 1);
      },
    }),
    categoriesOpen && h(window.BS.CategoriesPanel, {
      refreshKey, onRefresh: () => setRefreshKey(k => k + 1), onClose: () => setCategoriesOpen(false),
    }),

    position && h(window.BS.InvestmentPanel, {
      ids: position.ids, title: position.name, month: position.month || monthSel, onClose: () => setPosition(null)
    }),

    accountsOpen && h(window.BS.AccountsPanel, {
      onRefresh: () => setRefreshKey(k => k + 1), onClose: () => setAccountsOpen(false),
    }),
    settingsOpen && h(window.BS.SettingsPanel, {
      onClose: () => setSettingsOpen(false),
      onSaved: () => push("Configurações salvas", "success"),
    }),

    h(window.BS.CategoryEditor, {
      tx: editTx, onClose: () => setEditTx(null),
      onSave: (result) => {
        if (result?.deleted) {
          setEditTx(null);
          setConfirmDelete(result._tx);
          return;
        }
        {
          const parts = [];
          if (result?.category) parts.push(`Categoria: ${result.category}`);
          if ("display_name" in (result || {})) parts.push(result.display_name ? `Nome: ${result.display_name}` : "Nome fantasia removido");
          if ("is_third_party" in (result || {})) parts.push(result.is_third_party ? "Marcado em nome de terceiros" : "De volta aos seus totais");
          if ("recurring" in (result || {})) parts.push(result.recurring ? "Marcado como recorrente" : "Não é mais recorrente");
          push(parts.length ? parts.join(" · ") : "Salvo", "success");
          setRefreshKey(k => k + 1);
        }
        setEditTx(null);
      }
    }),

    confirmDelete && h(ConfirmDeleteModal, {
      tx: confirmDelete,
      onCancel: () => setConfirmDelete(null),
      onConfirm: () => { const id = confirmDelete.id; setConfirmDelete(null); handleDeleteTx(id); },
    }),

    Toaster()
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));

})();
