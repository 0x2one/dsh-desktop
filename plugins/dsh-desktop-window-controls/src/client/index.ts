/**
 * Browser half of the dsh-desktop window-controls plugin.
 *
 * Registers the native window controls (minimize / maximize / close) plus the
 * frameless-window drag strip into the harness web UI's frame-wide
 * `shell.overlay` slot, replacing the native frame that dsh-desktop hides
 * (`frame: false`).
 *
 * The controls are anchored to the **center (conversation) column**: they sit
 * at its top-right corner, and the drag strip covers its 40px title band. The
 * sidebar is not offset, so it reaches the very top of the window. Besides
 * the overlay entries, this module injects a small stylesheet that adapts the
 * top band by conversation state (see `titleBarCss`): in the hero state the
 * center column keeps a `TITLE_BAR_HEIGHT` top padding for the controls,
 * while with a conversation open the header starts at the very top so its
 * title row (title, mode, Session log) shares the top row with the window
 * controls.
 *
 * The controls call `window.api.windowControls.*`, exposed by the
 * dsh-desktop preload bridge, which talks to the Electron main process over
 * IPC. No harness source is modified; everything is contributed through the
 * public slot registry plus a scoped stylesheet.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { TITLE_BAR_HEIGHT, WindowControls } from './WindowControls.tsx'

/** Required services: the slot registry (declared by the layout plugin). */
export const inject = ['slots']

/** Stable list id for this contribution (shell.overlay is a list slot). */
export const WINDOW_CONTROLS_ID = 'dsh-desktop-window-controls'

/**
 * Id of the injected title-bar stylesheet (`data-dsh-css`), used to make the
 * injection idempotent across plugin reloads (live patch reload re-runs the
 * plugin body).
 */
const TITLE_BAR_CSS_ID = 'dsh-desktop-title-bar'

/**
 * Layout adjustments contributed by the window-controls plugin.
 *
 * The harness frame (`@deepseek-ai/dsh-client-ui-layout`'s AppFrame) is a
 * three-column grid (sidebar | center | details). The window controls belong
 * to the top-right corner of the center (conversation) column, and the
 * sidebar must reach the very top of the window, so the offset is applied to
 * the center column alone. The layout differs by conversation state:
 *
 * - **Hero (no open conversation)**: the conversation header is hidden, so
 *   the center column gets `padding-top: <height>` + `height: calc(100% -
 *   <height>)` to reserve the top row for the overlay controls.
 * - **Active (conversation open)**: the center column gets no top padding, so
 *   the conversation header (`wSkVaW_header` in the conversation package)
 *   naturally starts at the very top and its title row — session title, mode,
 *   and the Session log button — shares the top row with the window controls.
 *   A right margin on the header's **title row only** keeps its trailing
 *   utility buttons (Session log) clear of the window-control row (which
 *   floats at the content column's right edge); the tabs row below is left
 *   untouched so it keeps its full width.
 *
 * The two states are distinguished with `:has()` on the header's presence and
 * its `headerHidden` class. The layout package's CSS modules use hashed class
 * names, but the hashed names contain stable tokens: the center column's
 * class contains `centerCol`, the conversation header's class contains
 * `_header`, and the title row's class contains `titleRow`. Rules are scoped
 * inside the center column so they cannot affect the sidebar or other
 * surfaces. `:has()` is supported by the Electron 39 Chromium.
 */
const titleBarCss = `
div:has(> [data-shell-overlay]) > [class*="centerCol"]:has([class*="_header"][class*="headerHidden"]) {
  padding-top: ${TITLE_BAR_HEIGHT}px;
  height: calc(100% - ${TITLE_BAR_HEIGHT}px);
}
div:has(> [data-shell-overlay]) > [class*="centerCol"]:has([class*="_header"]:not([class*="headerHidden"])) {
  padding-top: 0px;
  height: 100%;
}
div:has(> [data-shell-overlay]) > [class*="centerCol"] [class*="_header"] > [class*="titleRow"] {
  margin-right: ${TITLE_BAR_HEIGHT + 70}px;
}
`

/** Idempotently inject the title-bar stylesheet into the document head. */
function ensureTitleBarCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-css="${TITLE_BAR_CSS_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.dshCss = TITLE_BAR_CSS_ID
  tag.textContent = titleBarCss
  document.head.appendChild(tag)
}

/**
 * Client plugin body: register the window controls and drag strip into
 * shell.overlay and inject the title-bar offset stylesheet. The `inject`
 * wrapper defers registration until the layout plugin declares the seat (it
 * is declared by ui-layout's AppFrame registration).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ensureTitleBarCss()
  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: WINDOW_CONTROLS_ID,
      // Render above other overlay entries (badges, toasts).
      order: 100,
    }, WindowControls),
  )
}

export type { WindowControlsProps } from './WindowControls.tsx'
