window.__ModuleLoader__.load({ id: "@dsh-desktop/settings", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __DSH_DESKTOP_SETTINGS_EXPORTS = (() => {
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

  // plugins/dsh-desktop-settings/src/client/index.ts
  var index_exports = {};
  __export(index_exports, {
    DESKTOP_SETTINGS_ID: () => DESKTOP_SETTINGS_ID,
    apply: () => apply,
    inject: () => inject
  });

  // plugins/dsh-desktop-settings/src/client/DesktopSection.tsx
  var import_react = __require("react");
  var import_jsx_runtime = __require("react/jsx-runtime");
  function readDesktopBridge() {
    if (typeof window === "undefined") return void 0;
    const api = window.api;
    return api?.desktop;
  }
  function DesktopSection({ t }) {
    const [snapshot, setSnapshot] = (0, import_react.useState)(null);
    const [busy, setBusy] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      const api2 = readDesktopBridge();
      if (api2 === void 0) return;
      void api2.getSnapshot().then(setSnapshot);
      return api2.onChange(setSnapshot);
    }, []);
    const run = (work) => {
      if (busy) return;
      setBusy(true);
      void work().finally(() => {
        setBusy(false);
      });
    };
    const api = readDesktopBridge();
    if (api === void 0) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-desktop-settings": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("hotkeyTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-hint": "", children: t("hotkeyDescription") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-dsh-ds-value": "", children: snapshot?.hotkeyLabel ?? "\u2026" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              "data-dsh-ds-button": "",
              disabled: busy,
              onClick: () => {
                run(async () => {
                  await api.editHotkey();
                });
              },
              children: t("hotkeyEdit")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("launchTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-choices": "", role: "radiogroup", "aria-label": t("launchTitle"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": snapshot?.launchAtLogin === true,
              "data-dsh-ds-choice": "",
              "data-selected": snapshot?.launchAtLogin === true ? "" : void 0,
              disabled: busy || snapshot === null,
              onClick: () => {
                if (snapshot?.launchAtLogin === true) return;
                run(async () => {
                  await api.setLaunchAtLogin(true);
                });
              },
              children: t("launchOn")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": snapshot?.launchAtLogin === false,
              "data-dsh-ds-choice": "",
              "data-selected": snapshot?.launchAtLogin === false ? "" : void 0,
              disabled: busy || snapshot === null,
              onClick: () => {
                if (snapshot?.launchAtLogin === false) return;
                run(async () => {
                  await api.setLaunchAtLogin(false);
                });
              },
              children: t("launchOff")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("profileTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-profiles": "", role: "radiogroup", "aria-label": t("profileTitle"), children: (snapshot?.profiles ?? []).map((name) => {
          const selected = name === snapshot?.currentProfile;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": selected,
              "data-dsh-ds-choice": "",
              "data-selected": selected ? "" : void 0,
              disabled: busy,
              onClick: () => {
                if (selected) return;
                run(async () => {
                  await api.selectProfile(name);
                });
              },
              children: name
            },
            name
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-row": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            disabled: busy,
            onClick: () => {
              run(async () => {
                await api.createProfile();
              });
            },
            children: t("profileCreate")
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("updateTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-row": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            disabled: busy,
            onClick: () => {
              api.checkUpdate();
            },
            children: t("updateAction")
          }
        ) })
      ] })
    ] });
  }

  // plugins/dsh-desktop-settings/src/client/locales.ts
  var en = {
    nav: "Desktop",
    hotkeyTitle: "Shortcut",
    hotkeyDescription: "Show or hide the main window",
    hotkeyEdit: "Change\u2026",
    launchTitle: "Launch at login",
    launchOn: "On",
    launchOff: "Off",
    profileTitle: "Startup environment",
    profileCreate: "New environment\u2026",
    updateTitle: "Updates",
    updateAction: "Check for updates\u2026"
  };
  var zh = {
    nav: "\u684C\u9762",
    hotkeyTitle: "\u5FEB\u6377\u952E",
    hotkeyDescription: "\u663E\u793A\u6216\u9690\u85CF\u4E3B\u7A97\u53E3",
    hotkeyEdit: "\u4FEE\u6539\u2026",
    launchTitle: "\u5F00\u673A\u81EA\u542F",
    launchOn: "\u5F00\u542F",
    launchOff: "\u5173\u95ED",
    profileTitle: "\u542F\u52A8\u73AF\u5883",
    profileCreate: "\u65B0\u589E\u73AF\u5883\u2026",
    updateTitle: "\u68C0\u67E5\u66F4\u65B0",
    updateAction: "\u68C0\u67E5\u66F4\u65B0\u2026"
  };

  // plugins/dsh-desktop-settings/src/client/index.ts
  var inject = ["slots", "locale"];
  var DESKTOP_SETTINGS_ID = "desktop";
  var NS = "dsh-desktop.settings";
  var SETTINGS_CSS_ID = "dsh-desktop-settings";
  var settingsCss = `
[data-dsh-desktop-settings] {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 0 24px;
}
[data-dsh-desktop-settings] [data-dsh-ds-group] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
[data-dsh-desktop-settings] [data-dsh-ds-group]:last-child {
  border-bottom: none;
}
[data-dsh-desktop-settings] [data-dsh-ds-title] {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-desktop-settings] [data-dsh-ds-hint] {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-desktop-settings] [data-dsh-ds-row] {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
[data-dsh-desktop-settings] [data-dsh-ds-value] {
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-desktop-settings] [data-dsh-ds-button] {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
[data-dsh-desktop-settings] [data-dsh-ds-button]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
[data-dsh-desktop-settings] [data-dsh-ds-button]:disabled {
  opacity: 0.5;
  cursor: default;
}
[data-dsh-desktop-settings] [data-dsh-ds-choices],
[data-dsh-desktop-settings] [data-dsh-ds-profiles] {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
[data-dsh-desktop-settings] [data-dsh-ds-choice] {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
[data-dsh-desktop-settings] [data-dsh-ds-choice]:hover:not(:disabled):not([data-selected]) {
  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent));
}
[data-dsh-desktop-settings] [data-dsh-ds-choice][data-selected] {
  background: var(--dsw-alias-bg-module-platform);
  border-color: var(--dsw-static-neutral-bluish-400, var(--dsw-alias-border-l1));
}
[data-dsh-desktop-settings] [data-dsh-ds-choice]:disabled {
  opacity: 0.5;
  cursor: default;
}
`;
  function ensureSettingsCss() {
    if (typeof document === "undefined") return;
    let tag = document.querySelector(`style[data-dsh-css="${SETTINGS_CSS_ID}"]`);
    if (tag === null) {
      tag = document.createElement("style");
      tag.dataset.dshCss = SETTINGS_CSS_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = settingsCss;
  }
  function removeSettingsCss() {
    if (typeof document === "undefined") return;
    document.querySelectorAll(`style[data-dsh-css="${SETTINGS_CSS_ID}"]`).forEach((el) => {
      el.remove();
    });
  }
  function isDesktopHost() {
    if (typeof window === "undefined") return false;
    const api = window.api;
    return api?.desktop !== void 0;
  }
  function apply(ctx) {
    if (!isDesktopHost()) {
      removeSettingsCss();
      return;
    }
    ensureSettingsCss();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-desktop-settings: dictionaries");
    const t = ctx.locale.bind(NS);
    ctx.slots.inject(
      "settings.section",
      () => ctx.slots.register(
        {
          name: "settings.section",
          id: DESKTOP_SETTINGS_ID,
          order: 5,
          label: () => t("nav"),
          inject: () => ({ t })
        },
        DesktopSection
      )
    );
  }
  return __toCommonJS(index_exports);
})();

module.exports = typeof __DSH_DESKTOP_SETTINGS_EXPORTS !== "undefined" ? __DSH_DESKTOP_SETTINGS_EXPORTS : module.exports; return module.exports; } });
