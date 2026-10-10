(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

const { useState: _acSt, useEffect: _acEf } = React;

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function AccountsPanel({ onRefresh, onClose }) {
  const { fmtBRL, fmtDateBR } = window.BS;

  const [accounts, setAccounts] = _acSt([]);
  const [err, setErr] = _acSt("");
  const [busy, setBusy] = _acSt(false);
  const [creating, setCreating] = _acSt(false);
  const [editingId, setEditingId] = _acSt(null);
  const [editName, setEditName] = _acSt("");
  const [form, setForm] = _acSt({ bank: "", name: "", type: "checking", initial: "" });
  //> Os bancos com adaptador vêm do servidor. Repetir a lista aqui faria a tela
  //> oferecer um banco que o import não sabe ler na primeira divergência.
  const [bancos, setBancos] = _acSt([]);
  _acEf(() => { fetchBanks().then(setBancos).catch(() => setBancos([])); }, []);

  const reload = () => fetchAllAccounts().then(setAccounts).catch(e => setErr(e.message));
  _acEf(() => { reload(); }, []);

  function refreshAll() {
    reload();
    onRefresh && onRefresh();
  }

  async function run(fn) {
    setBusy(true); setErr("");
    try { await fn(); refreshAll(); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const bank = form.bank.trim();
    const name = form.name.trim();
    if (!bank || !name) return;

    await run(async () => {
      await postAccount({
        id: slugify(`${bank}-${name}-${form.type === "checking" ? "db" : "cc"}`),
        bank, name, type: form.type,
      });
      setForm({ bank: "", name: "", type: "checking", initial: "" });
      setCreating(false);
    });
  }

  async function commitRename(acc) {
    const name = editName.trim();
    setEditingId(null);
    if (name && name !== acc.name) await run(() => patchAccount(acc.id, { name }));
  }

  const abertas = accounts.filter(a => !a.closed_at);

  function row(acc, aninhada) {
    const fat = acc.open_invoice;
    return h("div", {
      key: acc.id, className: "cat-row",
      style: aninhada ? { paddingLeft: 26 } : null,
    },
      aninhada
        ? h("span", { className: "acct-card-tree" }, "└")
        : h("div", { className: "px-swatch", style: { background: window.BS.bankColor(acc.bank, acc.id) } }),

      editingId === acc.id
        ? h("input", {
            className: "px-field", autoFocus: true, value: editName,
            onChange: e => setEditName(e.target.value),
            onKeyDown: e => {
              if (e.key === "Escape") setEditingId(null);
              if (e.key === "Enter") commitRename(acc);
            },
            onBlur: () => commitRename(acc),
            style: { flex: 1 },
          })
        : h("button", {
            className: "cat-name",
            disabled: true, onClick: () => { setEditingId(acc.id); setEditName(acc.name); },
          },
            acc.name,
            //> Aninhado já é cartão pela posição; repetir o rótulo é ruído.
            !aninhada && h("span", { style: { marginLeft: 8, fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" } },
              acc.type === "checking" ? "Conta" : "Cartão"),
          ),

      h("span", { className: "cat-count mono", style: fat ? { color: "var(--warn)" } : null },
        fat
          ? `Fatura: −${fmtBRL(Math.abs(fat.total))}${fat.due_date ? ` · Vence ${fmtDateBR(fat.due_date)}` : ""}`
          : acc.type === "credit_card" ? "Fatura paga" : fmtBRL(acc.balance || 0)),
    );
  }

  const footerAccounts = h("div", { className: "modal-footer-wrap" },
    h("div", { className: "modal-footer-meta" },
      `${abertas.length} ${abertas.length === 1 ? "conta ou cartão" : "contas e cartões"}`
    ),
    h("div", { className: "modal-footer-actions" },
      h("button", { className: "px-btn", onClick: onClose }, "Fechar")
    )
  );

  return h(window.BS.Modal, { open: true, onClose, title: "Contas e Cartões", width: 560, footer: footerAccounts },
    h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },

      creating
        ? h("form", { onSubmit: handleCreate, style: { display: "flex", flexDirection: "column", gap: 8 } },
            h("div", { style: { display: "flex", gap: 8 } },
              //> `list` e não `select`: a lista é atalho, o campo segue livre. um
              //> select fecharia a porta pra instituição que ainda não tem adaptador.
              h("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 2 } },
                h("input", {
                  className: "px-field", placeholder: "Banco", list: "bs-bancos",
                  value: form.bank, onChange: e => setForm({ ...form, bank: e.target.value }),
                  autoFocus: true,
                }),
                h("datalist", { id: "bs-bancos" },
                  bancos.map(b => h("option", { key: b.id, value: b.label }))),
                h("span", { style: { fontSize: 10, color: "var(--fg-3)" } }, "O formato é detectado no arquivo; o nome do banco é livre."),
              ),
              h("input", {
                className: "px-field", placeholder: "Nome da conta",
                value: form.name, onChange: e => setForm({ ...form, name: e.target.value }),
                style: { flex: 1.4 },
              }),
            ),
            h("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
              h(window.BS.SegmentControl, {
                options: [{ value: "checking", label: "Conta" }, { value: "credit_card", label: "Cartão" }],
                value: form.type, onChange: v => setForm({ ...form, type: v }), columns: 2, fill: true,
              }),
              h("span", { style: { fontSize: 11, color: "var(--fg-3)" } }, "O saldo vem dos extratos importados."),
            ),
            h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
              h("button", { className: "px-btn", type: "button", onClick: () => { setCreating(false); setErr(""); } }, "Cancelar"),
              h("button", {
                className: "px-btn px-btn--primary", type: "submit",
                disabled: true,
              }, busy ? "Criando…" : "Criar conta"),
            ),
          )
        : h("button", {
            className: "px-btn px-btn--primary", style: { alignSelf: "flex-start" },
            disabled: true, onClick: () => { setCreating(true); setErr(""); },
          }, "+ Nova conta ou cartão"),

      err && h("div", { className: "px-alert px-alert--neg" }, err),

      abertas.length === 0
        ? h("div", { className: "px-empty" }, "Nenhuma conta ainda.")
        : window.BS.groupByBank(abertas).map(g => h("div", { key: g.bank, className: "px-list" },
            g.contas.map(a => row(a, false)),
            g.cartoes.map(a => row(a, true)),
          )),
    ),
  );
}

window.BS = window.BS || {};
window.BS.AccountsPanel = AccountsPanel;

})();
