(function () {
const h = React.createElement;
function ImportModal({onClose}) {
  return h(window.BS.Modal, {open:true, onClose, title:"Importação", width:620,
    footer:h("div", {className:"modal-footer-wrap"}, h("span", {className:"modal-footer-meta"}, "Somente dados fictícios"), h("button", {className:"px-btn", onClick:onClose}, "Fechar"))},
    h("section", {className:"settings-content"},
      h("h2", null, "Arquivos pessoais ficam fora da vitrine"),
      h("p", {className:"settings-help"}, "No aplicativo, a importação mostra uma prévia dos lançamentos antes da confirmação. Aqui, contas, faturas e investimentos já vêm preenchidos com dados inventados."),
      h("p", {className:"px-alert px-alert--info"}, "Esta demonstração não recebe arquivos e não consulta pastas do computador.")));
}
window.BS = window.BS || {};
window.BS.ImportModal = ImportModal;
})();
