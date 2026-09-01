/**
 * Browser half of the dsh-desktop settings plugin.
 *
 * Registers a "Desktop" page into the harness settings panel (`settings.section`)
 * so hotkey, launch-at-login, profile switching, and check-for-updates live
 * next to General / Models / Plugins. Actions go through `window.api.desktop`.
 *
 * The plugin may still load from the dsh-desktop profile when the user runs
 * `dsh --profile dsh-desktop` in a normal browser; `apply` is then a no-op
 * because that host has no preload bridge. The host patch also disables this
 * plugin unless `DSH_DESKTOP=1`. No harness source is modified.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DesktopSection } from './DesktopSection.tsx'
import { en, zh, type DesktopKey } from './locales.ts'

/** Required services: slot registry + locale dictionaries. */
export const inject = ['slots', 'locale']

/** Stable section id (settings.section is a list slot). */
export const DESKTOP_SETTINGS_ID = 'desktop'

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-desktop.settings'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-desktop.settings': DesktopKey
  }
}

/** Id of the injected stylesheet (`data-dsh-css`). */
const SETTINGS_CSS_ID = 'dsh-desktop-settings'

/**
 * Settings-page styles using harness alias tokens. Scoped to
 * `[data-dsh-desktop-settings]` so they cannot leak into other sections.
 */
const settingsCss = `
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
`

/** Idempotently inject the settings stylesheet into the document head. */
function ensureSettingsCss(): void {
  if (typeof document === 'undefined') return
  let tag = document.querySelector<HTMLStyleElement>(`style[data-dsh-css="${SETTINGS_CSS_ID}"]`)
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.dshCss = SETTINGS_CSS_ID
    document.head.appendChild(tag)
  }
  tag.textContent = settingsCss
}

/** Drop leftover CSS (CLI / live reload after a desktop session). */
function removeSettingsCss(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`style[data-dsh-css="${SETTINGS_CSS_ID}"]`).forEach((el) => {
    el.remove()
  })
}

/**
 * Whether this page is the dsh-desktop Electron window.
 *
 * The preload bridge (`window.api.desktop`) is only exposed there.
 * Console `dsh --profile dsh-desktop` in a system browser has no bridge.
 */
function isDesktopHost(): boolean {
  if (typeof window === 'undefined') return false
  const api = (window as Window & { api?: { desktop?: unknown } }).api
  return api?.desktop !== undefined
}

/**
 * Client plugin body: register the Desktop settings section — but only when
 * the dsh-desktop preload bridge is present. Console `dsh --profile
 * dsh-desktop` in a normal browser has no bridge, so this is a no-op.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  if (!isDesktopHost()) {
    removeSettingsCss()
    return
  }
  ensureSettingsCss()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-desktop-settings: dictionaries')
  const t = ctx.locale.bind(NS) as (key: DesktopKey) => string
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: DESKTOP_SETTINGS_ID,
        order: 5,
        label: () => t('nav'),
        inject: () => ({ t })
      },
      DesktopSection
    )
  )
}

export type { DesktopSectionProps } from './DesktopSection.tsx'
