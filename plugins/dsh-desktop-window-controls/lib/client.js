window.__ModuleLoader__.load({ id: "@dsh-desktop/window-controls", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __DSH_WINDOW_CONTROLS_EXPORTS = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // plugins/dsh-desktop-window-controls/src/client/index.ts
  var index_exports = {};
  __export(index_exports, {
    WINDOW_CONTROLS_ID: () => WINDOW_CONTROLS_ID,
    apply: () => apply,
    inject: () => inject
  });

  // plugins/dsh-desktop-window-controls/src/client/WindowControls.tsx
  var import_react = __require("react");
  var import_jsx_runtime = __require("react/jsx-runtime");
  var TITLE_BAR_HEIGHT = 40;
  var styles = {
    /**
     * Draggable strip over the center column's title band. `position: fixed`
     * pins it to the viewport; `left`/`width` are set from the observed anchor
     * geometry so it always covers exactly the center column's top band.
     */
    dragStrip: {
      position: "fixed",
      top: "0px",
      height: `${TITLE_BAR_HEIGHT}px`,
      // Invisible: the strip only changes the hit-testing of the band.
      background: "transparent",
      // Electron moves the window when the user presses on a drag region.
      WebkitAppRegion: "drag",
      zIndex: 900,
      userSelect: "none",
      pointerEvents: "auto"
    },
    root: {
      position: "fixed",
      top: "0px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: `${TITLE_BAR_HEIGHT}px`,
      zIndex: 1e3,
      // Keep the buttons readable over any page surface.
      background: "transparent",
      userSelect: "none",
      WebkitAppRegion: "no-drag"
    },
    button: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "46px",
      height: "40px",
      border: "none",
      margin: 0,
      padding: 0,
      background: "transparent",
      color: "var(--dsw-alias-label-primary)",
      fontFamily: "inherit",
      fontSize: "13px",
      lineHeight: "1",
      cursor: "default",
      outline: "none"
    },
    buttonHover: {
      background: "var(--dsw-alias-bg-hover)"
    },
    closeHover: {
      background: "var(--dsw-alias-bg-danger, #e81123)",
      color: "#ffffff"
    },
    icon: {
      width: "12px",
      height: "12px",
      display: "block"
    }
  };
  function RestoreIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 10 10", style: styles.icon, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "rect",
      {
        x: "0.5",
        y: "0.5",
        width: "9",
        height: "9",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1"
      }
    ) });
  }
  function MaximizeIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 10 10", style: styles.icon, "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "rect",
        {
          x: "0.5",
          y: "0.5",
          width: "9",
          height: "9",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "rect",
        {
          x: "2",
          y: "2",
          width: "6",
          height: "6",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1",
          opacity: "0.4"
        }
      )
    ] });
  }
  function MinimizeIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 10 10", style: styles.icon, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "0.5", y: "4.5", width: "9", height: "1", fill: "currentColor" }) });
  }
  function findCenterColumn() {
    const frame = document.querySelector("div:has(> [data-shell-overlay])");
    if (frame === null) return null;
    const children = frame.children;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child instanceof HTMLElement && child.className.includes("centerCol")) return child;
    }
    return frame;
  }
  function WindowControls(_props) {
    const [maximized, setMaximized] = (0, import_react.useState)(false);
    const [anchor, setAnchor] = (0, import_react.useState)(null);
    (0, import_react.useEffect)(() => {
      const bridge2 = window.api?.windowControls;
      if (bridge2 === void 0) return;
      void bridge2.isMaximized().then(setMaximized);
      const unsubscribe = bridge2.onMaximizedChange(setMaximized);
      return unsubscribe;
    }, []);
    (0, import_react.useEffect)(() => {
      const frame = document.querySelector("div:has(> [data-shell-overlay])");
      if (frame === null) return;
      const target = findCenterColumn();
      if (target === null) return;
      const measure = () => {
        const r = target.getBoundingClientRect();
        setAnchor({ left: r.left, top: r.top, width: r.width });
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(target);
      observer.observe(frame);
      window.addEventListener("resize", measure);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", measure);
      };
    }, []);
    const bridge = window.api?.windowControls;
    if (bridge === void 0) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, {});
    }
    const onToggleMaximize = () => {
      void bridge.toggleMaximize().then(setMaximized);
    };
    const dragStripStyle = {
      ...styles.dragStrip,
      left: anchor !== null ? `${anchor.left}px` : "0px",
      width: anchor !== null ? `${anchor.width}px` : "100%"
    };
    const rootStyle = {
      ...styles.root,
      left: anchor !== null ? `${anchor.left + anchor.width - 3 * 46}px` : "auto",
      right: anchor !== null ? "auto" : "0px"
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: dragStripStyle, "aria-hidden": "true", "data-dsh-drag-strip": true }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, role: "toolbar", "aria-label": "Window controls", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "aria-label": "Minimize",
            title: "Minimize",
            onMouseEnter: (e) => {
              e.currentTarget.style.background = styles.buttonHover.background ?? "";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = "transparent";
            },
            onClick: () => bridge.minimize(),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MinimizeIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "aria-label": maximized ? "Restore" : "Maximize",
            title: maximized ? "Restore" : "Maximize",
            onMouseEnter: (e) => {
              e.currentTarget.style.background = styles.buttonHover.background ?? "";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = "transparent";
            },
            onClick: onToggleMaximize,
            children: maximized ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RestoreIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MaximizeIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "aria-label": "Close",
            title: "Close",
            onMouseEnter: (e) => {
              e.currentTarget.style.background = styles.closeHover.background ?? "";
              e.currentTarget.style.color = styles.closeHover.color ?? "";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--dsw-alias-label-primary)";
            },
            onClick: () => bridge.close(),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 10 10", style: styles.icon, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "path",
              {
                d: "M1 1 L9 9 M9 1 L1 9",
                stroke: "currentColor",
                strokeWidth: "1",
                fill: "none"
              }
            ) })
          }
        )
      ] })
    ] });
  }

  // plugins/dsh-desktop-window-controls/src/client/index.ts
  var inject = ["slots"];
  var WINDOW_CONTROLS_ID = "dsh-desktop-window-controls";
  var TITLE_BAR_CSS_ID = "dsh-desktop-title-bar";
  var titleBarCss = `
div:has(> [data-shell-overlay]) > [class*="centerCol"] {
  padding-top: ${TITLE_BAR_HEIGHT}px;
  height: calc(100% - ${TITLE_BAR_HEIGHT}px);
}
`;
  function ensureTitleBarCss() {
    if (typeof document === "undefined") return;
    if (document.querySelector(`style[data-dsh-css="${TITLE_BAR_CSS_ID}"]`) !== null) return;
    const tag = document.createElement("style");
    tag.dataset.dshCss = TITLE_BAR_CSS_ID;
    tag.textContent = titleBarCss;
    document.head.appendChild(tag);
  }
  function apply(ctx) {
    ensureTitleBarCss();
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register({
        name: "shell.overlay",
        id: WINDOW_CONTROLS_ID,
        // Render above other overlay entries (badges, toasts).
        order: 100
      }, WindowControls)
    );
  }
  return __toCommonJS(index_exports);
})();

module.exports = typeof __DSH_WINDOW_CONTROLS_EXPORTS !== "undefined" ? __DSH_WINDOW_CONTROLS_EXPORTS : module.exports; return module.exports; } });
