(function () {

const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

  /**
   * @brief   As barras de um mês no fluxo mês a mês.
   * @details No modo "vs ant." o mês anterior é uma MARCA DE NÍVEL atravessando a
   *          barra, não uma barra vizinha: a barra passar da linha já responde
   *          "subiu ou caiu", sem o olho medir a distância entre dois objetos.
   * @warning Altura zero tem duas causas: sem medição não desenha nada; zero MEDIDO
   *          ganha marca neutra, senão finge um valor pequeno que não existiu.
   * @note    Sem `data-tip` aqui: quem fala pelo mês é o balão do slot, um só.
   */
  function PixelBars({ slot, maxV, isPicked, compare }) {
    const specs = window.BS.barSpecs(slot, maxV, compare);

    return h("div", { className: "tl-bars" }, specs.map(s => {
      if (s.height <= 0) {
        return h("div", {
          key: s.key,
          className: s.measured ? "tl-bar tl-bar--zero" : "tl-bar",
        });
      }

      return h("div", {
        key: s.key,
        className: `tl-bar ${s.kind === "income" ? "dither-pos" : "dither-neg"}`,
        style: { height: s.height, opacity: isPicked ? 1 : 0.8 },
      },
        //> Onde a marca cai é geometria, não juízo: acima do topo quando o anterior
        //> foi MAIOR. Pelo sinal do delta a leitura invertia — "subiu" a põe DENTRO.
        s.markAt != null && h("span", {
          className: "tl-mark" + (s.markAt > s.height ? " tl-mark--fora" : ""),
          //> `--tl-queda`: a altura da haste até o topo da barra, que só o JS sabe.
          style: { bottom: s.markAt, "--tl-queda": (s.markAt - s.height) + "px" },
        }),
      );
    }));
  }

  window.BS = window.BS || {};
  window.BS.PixelBars = PixelBars;
})();
