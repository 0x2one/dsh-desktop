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
  function readWindowApi() {
    if (typeof window === "undefined") return void 0;
    return window.api;
  }
  function readDesktopBridge() {
    return readWindowApi()?.desktop;
  }
  function readUpdaterBridge() {
    return readWindowApi()?.updater;
  }
  function formatBytes(n) {
    if (n < 1024) return `${String(n)} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  function phaseKeepsPanel(phase) {
    return phase === "checking" || phase === "available" || phase === "downloading" || phase === "ready";
  }
  function keyEventParts(event) {
    return {
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      code: event.code,
      key: event.key
    };
  }
  function stopBubble(event) {
    event.stopPropagation();
  }
  function statusCopy(t, state) {
    switch (state.phase) {
      case "checking":
        return t("updateChecking");
      case "latest":
        return t("updateLatest");
      case "available":
        return state.nextVersion !== void 0 ? `${t("updateAvailable")} ${state.nextVersion}` : t("updateAvailable");
      case "downloading":
        return t("updateDownloading");
      case "ready":
        return t("updateReady");
      case "error":
        return state.error !== void 0 && state.error !== "" ? state.error : t("updateErrorFallback");
    }
  }
  function UpdatePanel({ t, state, onCollapse }) {
    const updater = readUpdaterBridge();
    const phase = state.phase;
    const percent = Math.max(0, Math.min(100, state.progress?.percent ?? 0));
    const notes = state.notes.trim();
    const showNotes = phase === "available" || phase === "downloading" || phase === "ready";
    const dismiss = () => {
      updater?.dismiss();
      onCollapse();
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-update": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-status": "", children: statusCopy(t, state) }),
      showNotes ? notes === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-hint": "", children: t("updateNotesEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { "data-dsh-ds-notes": "", children: state.notes }) : null,
      phase === "downloading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-progress": "", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-dsh-ds-progress-fill": "", style: { width: `${String(percent)}%` } }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { "data-dsh-ds-hint": "", children: [
          t("updateDownloaded"),
          " ",
          Math.round(percent),
          "%",
          state.progress !== void 0 && state.progress.total > 0 ? ` \xB7 ${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)}` : ""
        ] })
      ] }) : null,
      phase === "available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-dsh-ds-button": "", onClick: dismiss, children: t("updateNotNow") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            "data-primary": "",
            onClick: () => updater?.download(),
            children: t("updateDownload")
          }
        )
      ] }) : null,
      phase === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            onClick: () => {
              updater?.installLater();
              onCollapse();
            },
            children: t("updateInstallLater")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            "data-primary": "",
            onClick: () => updater?.installNow(),
            children: t("updateInstallNow")
          }
        )
      ] }) : null,
      phase === "latest" || phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-row": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-dsh-ds-button": "", "data-primary": "", onClick: dismiss, children: t("updateDismiss") }) }) : null
    ] });
  }
  function DesktopSection({ t }) {
    const [snapshot, setSnapshot] = (0, import_react.useState)(null);
    const [busy, setBusy] = (0, import_react.useState)(false);
    const [capturing, setCapturing] = (0, import_react.useState)(false);
    const [pending, setPending] = (0, import_react.useState)(null);
    const [hotkeyDefaults, setHotkeyDefaults] = (0, import_react.useState)(null);
    const [hotkeyError, setHotkeyError] = (0, import_react.useState)("");
    const [creating, setCreating] = (0, import_react.useState)(false);
    const [profileName, setProfileName] = (0, import_react.useState)("");
    const [profileError, setProfileError] = (0, import_react.useState)("");
    const [profileWarning, setProfileWarning] = (0, import_react.useState)("");
    const [updateState, setUpdateState] = (0, import_react.useState)(null);
    const [updateOpen, setUpdateOpen] = (0, import_react.useState)(false);
    const hotkeyInputRef = (0, import_react.useRef)(null);
    const capturingRef = (0, import_react.useRef)(false);
    (0, import_react.useEffect)(() => {
      const api2 = readDesktopBridge();
      if (api2 === void 0) return;
      void api2.getSnapshot().then(setSnapshot);
      return api2.onChange(setSnapshot);
    }, []);
    (0, import_react.useEffect)(() => {
      const updater = readUpdaterBridge();
      if (updater === void 0) return;
      const stop = updater.onState((state) => {
        setUpdateState(state);
        if (phaseKeepsPanel(state.phase)) setUpdateOpen(true);
      });
      void updater.getState().then((state) => {
        if (state === null) return;
        setUpdateState(state);
        if (phaseKeepsPanel(state.phase)) setUpdateOpen(true);
      });
      return stop;
    }, []);
    (0, import_react.useEffect)(() => {
      capturingRef.current = capturing;
    }, [capturing]);
    (0, import_react.useEffect)(() => {
      if (capturing) hotkeyInputRef.current?.focus();
    }, [capturing]);
    (0, import_react.useEffect)(() => {
      return () => {
        if (!capturingRef.current) return;
        const api2 = readDesktopBridge();
        if (api2 === void 0) return;
        void api2.cancelHotkeyCapture();
      };
    }, []);
    const run = (work) => {
      if (busy || capturing) return;
      setBusy(true);
      void work().finally(() => {
        setBusy(false);
      });
    };
    const api = readDesktopBridge();
    if (api === void 0) return null;
    const startCapture = () => {
      if (busy || capturing) return;
      setCapturing(true);
      setHotkeyError("");
      void (async () => {
        try {
          const state = await api.beginHotkeyCapture();
          setHotkeyDefaults({
            accelerator: state.defaultAccelerator,
            label: state.defaultLabel
          });
          setPending({ accelerator: state.accelerator, label: state.label });
        } catch {
          setHotkeyError(t("hotkeyCaptureFailed"));
        }
      })();
    };
    const stopCapture = () => {
      void api.cancelHotkeyCapture();
      setCapturing(false);
      setPending(null);
      setHotkeyError("");
    };
    const saveCapture = () => {
      if (pending === null || pending.accelerator === "") {
        setHotkeyError(t("hotkeyEmpty"));
        hotkeyInputRef.current?.focus();
        return;
      }
      void (async () => {
        const result = await api.commitHotkey(pending.accelerator);
        if (!result.ok) {
          setHotkeyError(result.error);
          hotkeyInputRef.current?.focus();
          return;
        }
        setCapturing(false);
        setPending(null);
        setHotkeyError("");
      })();
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-desktop-settings": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("hotkeyTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-hint": "", children: capturing ? t("hotkeyCaptureHint") : t("hotkeyDescription") }),
        capturing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-form": "", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref: hotkeyInputRef,
              "data-dsh-ds-input": "",
              type: "text",
              readOnly: true,
              autoComplete: "off",
              spellCheck: false,
              placeholder: t("hotkeyPlaceholder"),
              value: pending?.label ?? "",
              "aria-label": t("hotkeyTitle"),
              onKeyDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
                  stopCapture();
                  return;
                }
                void api.previewHotkey(keyEventParts(event)).then((result) => {
                  if (result === null) return;
                  setPending(result);
                  setHotkeyError("");
                });
              }
            }
          ),
          hotkeyError !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-error": "", children: hotkeyError }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                "data-dsh-ds-button": "",
                onClick: () => {
                  if (hotkeyDefaults === null) return;
                  setPending(hotkeyDefaults);
                  setHotkeyError("");
                  hotkeyInputRef.current?.focus();
                },
                children: t("hotkeyReset")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-dsh-ds-button": "", onClick: stopCapture, children: t("cancel") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-dsh-ds-button": "", "data-primary": "", onClick: saveCapture, children: t("hotkeySave") })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              "data-dsh-ds-value-btn": "",
              disabled: busy,
              onMouseDown: stopBubble,
              onClick: (event) => {
                event.stopPropagation();
                startCapture();
              },
              children: snapshot?.hotkeyLabel ?? "\u2026"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              "data-dsh-ds-button": "",
              disabled: busy,
              onMouseDown: stopBubble,
              onClick: (event) => {
                event.stopPropagation();
                startCapture();
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
              disabled: busy || capturing || snapshot === null,
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
              disabled: busy || capturing || snapshot === null,
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
              disabled: busy || capturing,
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
        creating ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "form",
          {
            "data-dsh-ds-form": "",
            onSubmit: (event) => {
              event.preventDefault();
              run(async () => {
                const result = await api.createProfile(profileName);
                if (!result.ok) {
                  setProfileError(result.error);
                  return;
                }
                setCreating(false);
                setProfileName("");
                setProfileError("");
                setProfileWarning(result.warning ?? "");
              });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { "data-dsh-ds-label": "", htmlFor: "dsh-desktop-profile-name", children: t("profileName") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  id: "dsh-desktop-profile-name",
                  "data-dsh-ds-input": "",
                  type: "text",
                  autoComplete: "off",
                  spellCheck: false,
                  placeholder: t("profilePlaceholder"),
                  value: profileName,
                  disabled: busy,
                  autoFocus: true,
                  onChange: (event) => {
                    setProfileName(event.target.value);
                    setProfileError("");
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-hint": "", children: t("profileHint") }),
              profileError !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-error": "", children: profileError }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-ds-row": "", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    "data-dsh-ds-button": "",
                    disabled: busy,
                    onClick: () => {
                      setCreating(false);
                      setProfileName("");
                      setProfileError("");
                    },
                    children: t("cancel")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "submit", "data-dsh-ds-button": "", "data-primary": "", disabled: busy, children: t("profileSubmit") })
              ] })
            ]
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-row": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            disabled: busy || capturing,
            onMouseDown: stopBubble,
            onClick: (event) => {
              event.stopPropagation();
              setCreating(true);
              setProfileError("");
              setProfileWarning("");
            },
            children: t("profileCreate")
          }
        ) }),
        profileWarning !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsh-ds-warn": "", children: profileWarning }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-dsh-ds-group": "", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { "data-dsh-ds-title": "", children: t("updateTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { "data-dsh-ds-hint": "", children: [
          t("updateCurrent"),
          " ",
          snapshot?.appVersion ?? updateState?.currentVersion ?? "\u2026"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-dsh-ds-row": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-dsh-ds-button": "",
            disabled: busy || capturing || updateState?.phase === "checking" || updateState?.phase === "downloading",
            onMouseDown: stopBubble,
            onClick: (event) => {
              event.stopPropagation();
              setUpdateOpen(true);
              setUpdateState((prev) => ({
                phase: "checking",
                currentVersion: prev?.currentVersion ?? snapshot?.appVersion ?? "",
                notes: ""
              }));
              api.checkUpdate();
            },
            children: t("updateAction")
          }
        ) }),
        updateOpen && updateState !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UpdatePanel, { t, state: updateState, onCollapse: () => setUpdateOpen(false) }) : null
      ] })
    ] });
  }

  // plugins/dsh-desktop-settings/src/client/locales.ts
  var en = {
    nav: "Desktop",
    hotkeyTitle: "Shortcut",
    hotkeyDescription: "Show or hide the main window",
    hotkeyEdit: "Change",
    hotkeyCaptureHint: "Press a new shortcut. Include Ctrl, Alt, or Shift.",
    hotkeyPlaceholder: "Press a shortcut",
    hotkeyEmpty: "Press a shortcut first.",
    hotkeyCaptureFailed: "Could not start shortcut recording.",
    hotkeyReset: "Restore default",
    hotkeySave: "Save",
    cancel: "Cancel",
    launchTitle: "Launch at login",
    launchOn: "On",
    launchOff: "Off",
    profileTitle: "Startup environment",
    profileCreate: "New environment",
    profileName: "Environment name",
    profileHint: "Lowercase letters, digits, and hyphens. Switching starts after create.",
    profilePlaceholder: "e.g. work or team-a",
    profileSubmit: "Create",
    updateTitle: "Updates",
    updateAction: "Check for updates",
    updateCurrent: "Current version",
    updateChecking: "Looking for a new version\u2026",
    updateLatest: "You already have the latest version.",
    updateAvailable: "A new version is available.",
    updateDownloading: "Downloading\u2026",
    updateReady: "You can keep working. The new version installs the next time you launch.",
    updateErrorFallback: "Could not check or download. Try again later.",
    updateDownload: "Download",
    updateNotNow: "Not now",
    updateInstallNow: "Restart and install now",
    updateInstallLater: "Install on next launch",
    updateDismiss: "Dismiss",
    updateNotesEmpty: "No release notes.",
    updateDownloaded: "Downloaded"
  };
  var zh = {
    nav: "\u684C\u9762",
    hotkeyTitle: "\u5FEB\u6377\u952E",
    hotkeyDescription: "\u663E\u793A\u6216\u9690\u85CF\u4E3B\u7A97\u53E3",
    hotkeyEdit: "\u4FEE\u6539",
    hotkeyCaptureHint: "\u70B9\u51FB\u8F93\u5165\u6846\u540E\u6309\u4E0B\u7EC4\u5408\u952E\u3002\u9700\u5305\u542B Ctrl\u3001Alt \u6216 Shift\u3002",
    hotkeyPlaceholder: "\u6309\u4E0B\u65B0\u7684\u5FEB\u6377\u952E",
    hotkeyEmpty: "\u8BF7\u5148\u6309\u4E0B\u8981\u4F7F\u7528\u7684\u5FEB\u6377\u952E\u3002",
    hotkeyCaptureFailed: "\u65E0\u6CD5\u5F00\u59CB\u5F55\u5236\u5FEB\u6377\u952E\u3002",
    hotkeyReset: "\u6062\u590D\u9ED8\u8BA4",
    hotkeySave: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    launchTitle: "\u5F00\u673A\u81EA\u542F",
    launchOn: "\u5F00\u542F",
    launchOff: "\u5173\u95ED",
    profileTitle: "\u542F\u52A8\u73AF\u5883",
    profileCreate: "\u65B0\u589E\u73AF\u5883",
    profileName: "\u73AF\u5883\u540D\u79F0",
    profileHint: "\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u548C\u8FDE\u5B57\u7B26\u3002\u521B\u5EFA\u540E\u4F1A\u5207\u6362\u5230\u8BE5\u73AF\u5883\u3002",
    profilePlaceholder: "\u4F8B\u5982 work \u6216 team-a",
    profileSubmit: "\u521B\u5EFA",
    updateTitle: "\u68C0\u67E5\u66F4\u65B0",
    updateAction: "\u68C0\u67E5\u66F4\u65B0",
    updateCurrent: "\u5F53\u524D\u7248\u672C",
    updateChecking: "\u6B63\u5728\u67E5\u770B\u6709\u6CA1\u6709\u65B0\u7248\u672C\u2026",
    updateLatest: "\u6CA1\u6709\u65B0\u7248\u672C\uFF0C\u7EE7\u7EED\u7528\u73B0\u5728\u8FD9\u4E00\u7248\u5373\u53EF\u3002",
    updateAvailable: "\u6709\u65B0\u7248\u672C\u53EF\u7528\u3002",
    updateDownloading: "\u6B63\u5728\u4E0B\u8F7D\u2026",
    updateReady: "\u53EF\u4EE5\u7EE7\u7EED\u7528\u3002\u9000\u51FA\u5E94\u7528\u540E\uFF0C\u4E0B\u6B21\u542F\u52A8\u4F1A\u88C5\u4E0A\u65B0\u7248\u672C\u3002",
    updateErrorFallback: "\u67E5\u4E0D\u5230\u66F4\u65B0\uFF0C\u4E5F\u4E0B\u4E0D\u4E0B\u6765\u3002\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002",
    updateDownload: "\u4E0B\u8F7D",
    updateNotNow: "\u4EE5\u540E\u518D\u8BF4",
    updateInstallNow: "\u73B0\u5728\u91CD\u542F\u5E76\u5B89\u88C5",
    updateInstallLater: "\u4E0B\u6B21\u542F\u52A8\u65F6\u5B89\u88C5",
    updateDismiss: "\u5173\u95ED",
    updateNotesEmpty: "\u6682\u65E0\u66F4\u65B0\u8BF4\u660E\u3002",
    updateDownloaded: "\u5DF2\u4E0B\u8F7D"
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
  pointer-events: auto;
  -webkit-app-region: no-drag;
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
[data-dsh-desktop-settings] [data-dsh-ds-value-btn] {
  appearance: none;
  -webkit-appearance: none;
  -webkit-app-region: no-drag;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
}
[data-dsh-desktop-settings] [data-dsh-ds-button] {
  appearance: none;
  -webkit-appearance: none;
  -webkit-app-region: no-drag;
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
[data-dsh-desktop-settings] [data-dsh-ds-button][data-primary] {
  border-color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-primary, #fff);
}
[data-dsh-desktop-settings] [data-dsh-ds-button][data-primary]:hover:not(:disabled) {
  opacity: 0.9;
}
[data-dsh-desktop-settings] [data-dsh-ds-form] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
}
[data-dsh-desktop-settings] [data-dsh-ds-label] {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-desktop-settings] [data-dsh-ds-input] {
  appearance: none;
  -webkit-appearance: none;
  -webkit-app-region: no-drag;
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  outline: none;
}
[data-dsh-desktop-settings] [data-dsh-ds-input]:focus {
  border-color: var(--dsw-alias-label-primary);
}
[data-dsh-desktop-settings] [data-dsh-ds-error] {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
[data-dsh-desktop-settings] [data-dsh-ds-warn] {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  color: var(--dsw-alias-label-secondary);
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
[data-dsh-desktop-settings] [data-dsh-ds-update] {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 480px;
}
[data-dsh-desktop-settings] [data-dsh-ds-status] {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-desktop-settings] [data-dsh-ds-notes] {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 10px 12px;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-desktop-settings] [data-dsh-ds-progress] {
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l2);
  overflow: hidden;
}
[data-dsh-desktop-settings] [data-dsh-ds-progress-fill] {
  display: block;
  height: 100%;
  background: var(--dsw-alias-label-primary);
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
