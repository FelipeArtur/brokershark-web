(function () {
  "use strict";

  /**
   * Balão de fala para `[data-tip]`. Um nó só, no `body`, posicionado em
   * `fixed` — e é por isso que não dá pra ser CSS puro: quase todo tooltip do
   * painel vive dentro de `.widget` (`overflow: hidden`) ou de `.table-scroll`,
   * e um `::after` no próprio elemento sairia cortado pela borda do widget.
   *
   * Delegação em `document`: 60 tooltips não viram 60 componentes React com
   * estado de hover — o custo é um listener e um nó reaproveitado.
   */

  const FOLGA = 10;
  const BORDA = 4;

  let balao = null;
  let alvo = null;

  function no() {
    if (balao) return balao;
    balao = document.createElement("div");
    balao.className = "px-tip";
    balao.id = "px-tip";
    balao.setAttribute("role", "tooltip");
    document.body.appendChild(balao);
    return balao;
  }

  function posicionar(el, b) {
    const r = el.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = b;

    //> Acima é o padrão; só cai pra baixo quando não cabe. O rabicho segue.
    let top = r.top - h - FOLGA;
    b.dataset.dir = "up";
    if (top < BORDA) {
      top = r.bottom + FOLGA;
      b.dataset.dir = "down";
    }

    //> O rabicho aponta pro elemento, não pro canto do balão: se o balão for
    //> empurrado pela borda da tela, o rabicho anda junto e continua apontando.
    const left = Math.max(BORDA, Math.min(r.left, window.innerWidth - w - BORDA));
    const ancora = r.left + Math.min(r.width, 40) / 2;
    b.style.setProperty("--tip-tail", Math.max(6, Math.min(ancora - left, w - 18)) + "px");
    b.style.left = left + "px";
    b.style.top = top + "px";
  }

  function mostrar(el) {
    const texto = el.getAttribute("data-tip");
    if (!texto) return esconder();
    const b = no();
    b.textContent = texto;
    b.dataset.show = "1";
    alvo = el;
    //> Sem isto o leitor de tela perderia o que o `title` nativo dizia.
    el.setAttribute("aria-describedby", "px-tip");
    posicionar(el, b);
  }

  function esconder() {
    if (alvo) alvo.removeAttribute("aria-describedby");
    alvo = null;
    if (balao) balao.dataset.show = "";
  }

  const gatilho = (e) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);

  document.addEventListener("mouseover", (e) => {
    const el = gatilho(e);
    //> Reabre também quando o TEXTO mudou no mesmo elemento: um toggle reescreve
    //> o `data-tip` sob o ponteiro, e o balão ficava no número de antes do clique.
    if (el && (el !== alvo || el.getAttribute("data-tip") !== balao.textContent)) mostrar(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (alvo && !alvo.contains(e.relatedTarget)) esconder();
  });
  document.addEventListener("focusin", (e) => {
    const el = gatilho(e);
    if (el) mostrar(el); else esconder();
  });
  document.addEventListener("focusout", esconder);
  //> Esc fecha o balão sem consumir o evento: quem fecha modal é o modal.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") esconder(); });
  //> Reposiciona em vez de esconder: em `fixed` o balão ficaria parado sobre o nada,
  //> e esconder apagava o balão que o próprio hover acabou de abrir.
  document.addEventListener("scroll", () => { if (alvo) posicionar(alvo, no()); }, true);
  window.addEventListener("resize", esconder);
})();
