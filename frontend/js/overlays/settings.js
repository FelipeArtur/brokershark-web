(function () {
const h = React.createElement;
function SettingsPanel({onClose}) {
  const [tab, setTab] = React.useState("imports");
  return h(window.BS.Modal, {open:true, onClose, title:"Configurações", width:620, className:"settings-modal",
    footer:h("div", {className:"modal-footer-wrap"}, h("span", {className:"modal-footer-meta"}, "Demonstração somente leitura"), h("button", {className:"px-btn", onClick:onClose}, "Fechar"))},
    h("nav", {className:"settings-tabs", "aria-label":"Áreas de configuração"},
      h("button", {className:tab === "imports" ? "settings-tab is-active" : "settings-tab", "aria-current":tab === "imports" ? "page" : undefined, onClick:()=>setTab("imports")}, "Importação"),
      h("button", {className:tab === "backup" ? "settings-tab is-active" : "settings-tab", "aria-current":tab === "backup" ? "page" : undefined, onClick:()=>setTab("backup")}, "Backup e avisos")),
    h("section", {className:"settings-content"},
      h("h2", null, tab === "imports" ? "Importação automática" : "Proteção dos dados"),
      h("p", {className:"settings-help"}, tab === "imports"
        ? "No aplicativo, você pode escolher pastas para importar extratos e faturas. A vitrine usa apenas o cenário fictício que acompanha a demonstração."
        : "No aplicativo, você pode guardar cópias da base e receber avisos. A vitrine não consulta backups nem configurações pessoais."),
      h("p", {className:"settings-empty"}, tab === "imports" ? "Nenhuma pasta é acessada nesta demonstração." : "Backup e avisos estão desativados nesta demonstração.")));
}
window.BS = window.BS || {};
window.BS.SettingsPanel = SettingsPanel;
})();
