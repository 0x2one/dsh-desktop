/**
 * Window controls component: minimize / maximize / close rendered at the
 * top-right corner of the **center (conversation) column**, plus the drag
 * strip that makes that title-bar band draggable.
 *
 * The Electron window is created with `frame: false`, so there is no native
 * title bar. This component contributes two things into the frame-wide
 * `shell.overlay` layer:
 *
 * 1. A drag strip over the center column's 40px title band, marked
 *    `-webkit-app-region: drag` — the surface the OS uses to move the window.
 *    It sits behind the control buttons (the row is `no-drag`), so clicks on
 *    the buttons still reach them.
 * 2. The minimize / maximize / close row at the top-right corner of the
 *    center column.
 *
 * Both elements are anchored to the center column's geometry (tracked with a
 * ResizeObserver), so they follow the column as the sidebar or details panel
 * widths change and when the window resizes. The sidebar reaches the very top
 * of the window (y = 0); the center column is offset down by `TITLE_BAR_HEIGHT`
 * via an injected stylesheet (see `client/index.ts`).
 *
 * Pure React + inline styles using the harness theme CSS variables
 * (`--dsw-alias-*`) so the controls follow the active color scheme. All
 * window operations go through the dsh-desktop preload bridge
 * (`window.api.windowControls`); the component holds no state beyond the
 * maximize mirror fed by the main process and the anchor geometry.
 */
import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Height of the title-bar band (px); must match `TITLE_BAR_HEIGHT` in client/index.ts. */
export const TITLE_BAR_HEIGHT = 40

/** Full props: the shell.overlay runtime share (root scope). */
export type WindowControlsProps = PropsRuntime<'shell.overlay'>

/** Geometry of the anchor element (the center column) in viewport coordinates. */
interface AnchorRect {
  left: number
  top: number
  width: number
}

/**
 * Drag-strip geometry. The strip covers the center column's title band, but
 * when a conversation header is visible it narrows to the session-title area
 * (the non-interactive crumbs) so mode/Session log controls stay clickable.
 */
interface DragRect {
  left: number
  width: number
}

/** Inline style declarations for the drag strip, control row and buttons. */
const styles = {
  /**
   * Draggable strip over the center column's title band. `position: fixed`
   * pins it to the viewport; `left`/`width` are set from the observed anchor
   * geometry so it always covers exactly the center column's top band.
   */
  dragStrip: {
    position: 'fixed' as const,
    top: '0px',
    height: `${TITLE_BAR_HEIGHT}px`,
    // Invisible: the strip only changes the hit-testing of the band.
    background: 'transparent',
    // Electron moves the window when the user presses on a drag region.
    WebkitAppRegion: 'drag' as const,
    zIndex: 900,
    userSelect: 'none' as const,
    pointerEvents: 'auto' as const,
  },
  root: {
    position: 'fixed' as const,
    top: '0px',
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    height: `${TITLE_BAR_HEIGHT}px`,
    zIndex: 1000,
    // Keep the buttons readable over any page surface.
    background: 'transparent',
    userSelect: 'none' as const,
    WebkitAppRegion: 'no-drag' as const,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '46px',
    height: '40px',
    border: 'none',
    margin: 0,
    padding: 0,
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: '13px',
    lineHeight: '1',
    cursor: 'default',
    outline: 'none',
  } as React.CSSProperties,
  buttonHover: {
    background: 'var(--dsw-alias-bg-hover)',
  } as React.CSSProperties,
  closeHover: {
    background: 'var(--dsw-alias-bg-danger, #e81123)',
    color: '#ffffff',
  } as React.CSSProperties,
  icon: {
    width: '12px',
    height: '12px',
    display: 'block',
  },
} as const

/** Restore glyph (single rectangle). */
function RestoreIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 10 10" style={styles.icon} aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none"
        stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** Maximize glyph (two overlapping rectangles). */
function MaximizeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 10 10" style={styles.icon} aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none"
        stroke="currentColor" strokeWidth="1" />
      <rect x="2" y="2" width="6" height="6" fill="none"
        stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  )
}

/** Minimize glyph (a horizontal dash). */
function MinimizeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 10 10" style={styles.icon} aria-hidden="true">
      <rect x="0.5" y="4.5" width="9" height="1" fill="currentColor" />
    </svg>
  )
}

/**
 * Find the anchor element: the harness frame's center column (the grid child
 * that carries the conversation). The layout package's class names are hashed
 * but the center column's class carries the stable `centerCol` token
 * (`pI_x6G_centerCol`), so it is located by class. Falls back to the frame.
 */
function findCenterColumn(): HTMLElement | null {
  const frame = document.querySelector<HTMLElement>('div:has(> [data-shell-overlay])')
  if (frame === null) return null
  const children = frame.children
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as HTMLElement
    if (child instanceof HTMLElement && child.className.includes('centerCol')) return child
  }
  return frame
}

/**
 * The conversation header inside the center column (`wSkVaW_header` in the
 * conversation package; hidden in the hero state via a `headerHidden` class).
 * @returns the header element when a conversation is open, else null.
 */
function findConversationHeader(center: HTMLElement): HTMLElement | null {
  const header = center.querySelector<HTMLElement>('[class*="_header"]')
  if (header === null || header.className.includes('headerHidden')) return null
  return header
}

/**
 * The session-title area inside the conversation header — the non-interactive
 * crumbs that lead the title row. Its right edge bounds the drag strip when a
 * conversation is open, so the mode switch and Session log buttons (which sit
 * to its right) stay clickable.
 */
function findTitleArea(header: HTMLElement): HTMLElement | null {
  return header.querySelector<HTMLElement>('[class*="_crumbs"]')
}

/**
 * The window control row and drag strip, anchored to the center column.
 * Rendered inside the frame-wide shell.overlay layer; the layer is
 * click-through except for entries, and our roots opt into pointer events via
 * the layer's `> *` rule.
 * @param _props - runtime share (unused: root scope carries no owner data).
 */
export function WindowControls(_props: WindowControlsProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  // Viewport geometry of the center column; drives the fixed positioning of
  // the drag strip and the control row. null until the first observation.
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  // Drag-strip geometry (may be narrower than the column when a conversation
  // header is open, to keep its utility buttons clickable).
  const [drag, setDrag] = useState<DragRect | null>(null)

  useEffect(() => {
    const bridge = window.api?.windowControls
    if (bridge === undefined) return
    void bridge.isMaximized().then(setMaximized)
    const unsubscribe = bridge.onMaximizedChange(setMaximized)
    return unsubscribe
  }, [])

  useEffect(() => {
    const frame = document.querySelector<HTMLElement>('div:has(> [data-shell-overlay])')
    if (frame === null) return
    const target = findCenterColumn()
    if (target === null) return

    const measure = (): void => {
      const r = target.getBoundingClientRect()
      setAnchor({ left: r.left, top: r.top, width: r.width })
      const header = findConversationHeader(target)
      if (header === null) {
        // Hero state: the strip covers the full title band of the column.
        setDrag({ left: r.left, width: r.width })
        return
      }
      const titleArea = findTitleArea(header)
      if (titleArea === null) {
        // Header visible but no title area located: fall back to a safe
        // margin (keep the right part clear of the control row).
        setDrag({ left: r.left, width: Math.max(0, r.width - TITLE_BAR_HEIGHT - 120) })
        return
      }
      const t = titleArea.getBoundingClientRect()
      setDrag({ left: r.left, width: Math.max(0, t.right - r.left) })
    }
    measure()
    // Track the column geometry (window resize, sidebar/details drag, collapse).
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    // Also observe the frame: a window resize changes the grid, which may
    // resize the column even when its own box doesn't report a change.
    observer.observe(frame)
    // The header appears/disappears when a conversation opens/closes, and its
    // internal geometry changes with the title; a MutationObserver catches
    // those transitions that ResizeObserver may miss.
    const mutation = new MutationObserver(measure)
    mutation.observe(target, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const bridge = window.api?.windowControls
  if (bridge === undefined) {
    // No preload bridge (plain browser context): render nothing rather than a
    // dead control row.
    return <></>
  }

  const onToggleMaximize = (): void => {
    void bridge.toggleMaximize().then(setMaximized)
  }

  const dragStripStyle: React.CSSProperties = {
    ...styles.dragStrip,
    left: drag !== null ? `${drag.left}px` : '0px',
    width: drag !== null ? `${drag.width}px` : '100%',
  }
  const rootStyle: React.CSSProperties = {
    ...styles.root,
    left: anchor !== null ? `${anchor.left + anchor.width - 3 * 46}px` : 'auto',
    right: anchor !== null ? 'auto' : '0px',
  }

  return (
    <>
      {/* Drag surface over the center column's title band: dragging moves the
          window. Rendered first so the control row (z-index 1000) stacks above. */}
      <div style={dragStripStyle} aria-hidden="true" data-dsh-drag-strip />
      <div style={rootStyle} role="toolbar" aria-label="Window controls">
      <button
        type="button"
        style={styles.button}
        aria-label="Minimize"
        title="Minimize"
        onMouseEnter={(e) => { e.currentTarget.style.background = styles.buttonHover.background ?? '' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        onClick={() => bridge.minimize()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        style={styles.button}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        onMouseEnter={(e) => { e.currentTarget.style.background = styles.buttonHover.background ?? '' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        onClick={onToggleMaximize}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        style={styles.button}
        aria-label="Close"
        title="Close"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = styles.closeHover.background ?? ''
          e.currentTarget.style.color = styles.closeHover.color ?? ''
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--dsw-alias-label-primary)'
        }}
        onClick={() => bridge.close()}
      >
        <svg viewBox="0 0 10 10" style={styles.icon} aria-hidden="true">
          <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1"
            fill="none" />
        </svg>
      </button>
      </div>
    </>
  )
}
