(function () {

function IconLock({ size = 16, open = false }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  },
    React.createElement("rect", { x: 3.5, y: 7, width: 9, height: 6.5, rx: 1.2 }),
    React.createElement("path", { d: open ? "M5.5 7 V5 a2.5 2.5 0 0 1 4.8 -1" : "M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7" })
  );
}

function IconImport({ size = 17 }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
  },
    React.createElement("path", { d: "M8 11 L8 2" }),
    React.createElement("path", { d: "M4 6 L8 2 L12 6" }),
    React.createElement("path", { d: "M2 14 L14 14" })
  );
}

function IconRefresh({ size = 14 }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  },
    React.createElement("path", { d: "M2.5 8a5.5 5.5 0 1 0 1.2-3.4" }),
    React.createElement("path", { d: "M2.5 2.5v3.2h3.2" })
  );
}

function IconBackup({ size = 14 }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  },
    React.createElement("path", { d: "M8 2.5v8" }),
    React.createElement("path", { d: "M5 7.5l3 3 3-3" }),
    React.createElement("path", { d: "M2.5 13.5h11" })
  );
}

function IconGear({ size = 13 }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  },
    React.createElement("circle", { cx: 8, cy: 8, r: 2.75 }),
    React.createElement("path", { d: "M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" })
  );
}

window.BS = window.BS || {};
window.BS.IconLock = IconLock;
window.BS.IconImport = IconImport;
window.BS.IconRefresh = IconRefresh;
window.BS.IconBackup = IconBackup;
window.BS.IconGear = IconGear;

})();
