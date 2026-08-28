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
      // Background is fully owned by the injected stylesheet
      // (`[data-dsh-window-controls] { background: transparent }`) — no inline
      // value, so the CSS rules keep full control.
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
      color: "var(--dsw-alias-label-secondary)",
      fontFamily: "inherit",
      fontSize: "13px",
      lineHeight: "1",
      cursor: "default",
      outline: "none"
      // Background and opacity are fully owned by the injected stylesheet
      // (`[data-dsh-wc-button]` default + `:hover` rules) — no inline values,
      // so the hover background actually applies (an inline background would
      // win over the external :hover rule).
    },
    icon: {
      width: "13px",
      height: "13px",
      display: "block"
    }
  };
  function Glyph({ children }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 10 10", style: styles.icon, "aria-hidden": "true", fill: "none", children });
  }
  function RestoreIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Glyph, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1.5", y: "3", width: "5.5", height: "5.5", stroke: "currentColor", strokeWidth: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "1.5", width: "5.5", height: "5.5", stroke: "currentColor", strokeWidth: "1", opacity: "0.45" })
    ] });
  }
  function MaximizeIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Glyph, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1.5", y: "1.5", width: "7", height: "7", stroke: "currentColor", strokeWidth: "1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "3", width: "5.5", height: "5.5", stroke: "currentColor", strokeWidth: "1", opacity: "0.35" })
    ] });
  }
  function MinimizeIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Glyph, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1", y: "4.5", width: "8", height: "1.2", fill: "currentColor", rx: "0.6" }) });
  }
  function CloseIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Glyph, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M2 2 L8 8 M8 2 L2 8",
        stroke: "currentColor",
        strokeWidth: "1",
        strokeLinecap: "round"
      }
    ) });
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
  function findConversationHeader(center) {
    const header = center.querySelector('[class*="_header"]');
    if (header === null || header.className.includes("headerHidden")) return null;
    return header;
  }
  function findTitleArea(header) {
    return header.querySelector('[class*="_crumbs"]');
  }
  function findModeSwitch(header) {
    return header.querySelector('[class*="_headerActions"]');
  }
  function findUtilities(header) {
    return header.querySelector('[class*="_headerUtilities"]');
  }
  function WindowControls(_props) {
    const [maximized, setMaximized] = (0, import_react.useState)(false);
    const [anchor, setAnchor] = (0, import_react.useState)(null);
    const [drag, setDrag] = (0, import_react.useState)([]);
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
        const header = findConversationHeader(target);
        if (header === null) {
          setDrag([{ left: r.left, width: r.width }]);
          return;
        }
        const titleArea = findTitleArea(header);
        const mode = findModeSwitch(header);
        const utils = findUtilities(header);
        const segments = [];
        const clamp = (left, right) => {
          const w = right - left;
          if (w > 0) segments.push({ left: Math.round(left), width: Math.round(w) });
        };
        if (titleArea !== null) {
          const modeLeft = mode !== null ? mode.getBoundingClientRect().left : void 0;
          const titleRight = titleArea.getBoundingClientRect().right;
          clamp(r.left, modeLeft !== void 0 ? modeLeft : titleRight);
        }
        if (mode !== null && utils !== null) {
          const modeRight = mode.getBoundingClientRect().right;
          const utilsLeft = utils.getBoundingClientRect().left;
          clamp(modeRight, utilsLeft);
        }
        if (segments.length === 0) {
          segments.push({ left: r.left, width: Math.max(0, r.width - TITLE_BAR_HEIGHT - 120) });
        }
        setDrag(segments);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(target);
      observer.observe(frame);
      const mutation = new MutationObserver(measure);
      mutation.observe(target, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      window.addEventListener("resize", measure);
      return () => {
        observer.disconnect();
        mutation.disconnect();
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
    const rootStyle = {
      ...styles.root,
      left: anchor !== null ? `${anchor.left + anchor.width - 3 * 46}px` : "auto",
      right: anchor !== null ? "auto" : "0px"
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      drag.map((segment, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          style: {
            ...styles.dragStrip,
            left: `${segment.left}px`,
            width: `${segment.width}px`
          },
          "aria-hidden": "true",
          "data-dsh-drag-strip": true
        },
        index
      )),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, role: "toolbar", "aria-label": "Window controls", "data-dsh-window-controls": true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "data-dsh-wc-button": true,
            "aria-label": "Minimize",
            title: "Minimize",
            onClick: () => bridge.minimize(),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MinimizeIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "data-dsh-wc-button": true,
            "aria-label": maximized ? "Restore" : "Maximize",
            title: maximized ? "Restore" : "Maximize",
            onClick: onToggleMaximize,
            children: maximized ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RestoreIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MaximizeIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.button,
            "data-dsh-wc-button": true,
            "data-close": true,
            "aria-label": "Close",
            title: "Close",
            onClick: () => bridge.close(),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloseIcon, {})
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
  padding-top: 0px;
  height: 100%;
}
div:has(> [data-shell-overlay]) > [class*="centerCol"] [class*="_header"] > [class*="titleRow"] {
  margin-right: ${TITLE_BAR_HEIGHT + 70}px;
}
[data-dsh-window-controls] {
  background: transparent;
}
[data-dsh-window-controls] [data-dsh-wc-button] {
  background: transparent;
  opacity: 0.85;
}
/* The harness's own hover token (--dsw-alias-interactive-bg-hover) is only
   ~6% alpha \u2014 nearly invisible for window chrome. Use a theme-aware 12%
   overlay of the primary label color instead, so the hover state is clearly
   visible in both light and dark themes. */
[data-dsh-window-controls] [data-dsh-wc-button]:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  opacity: 1;
}
[data-dsh-window-controls] [data-dsh-wc-button][data-close]:hover {
  background: var(--dsw-alias-state-error-primary, #e81123);
  color: #ffffff;
  opacity: 1;
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
