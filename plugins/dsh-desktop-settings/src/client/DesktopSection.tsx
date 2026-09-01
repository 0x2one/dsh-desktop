/**
 * Desktop settings section: hotkey, launch-at-login, profiles, check-for-updates.
 *
 * All actions go through `window.api.desktop` (dsh-desktop preload). The
 * tray menu keeps the same actions; this page is a second surface, not a
 * replacement. Styling uses harness alias tokens so light/dark themes match.
 */
import { useEffect, useState } from 'react'
import type { DesktopKey } from './locales.ts'

/** Snapshot shape mirrored from the preload `DesktopSnapshot`. */
export interface DesktopSnapshot {
  hotkeyLabel: string
  launchAtLogin: boolean
  profiles: string[]
  currentProfile: string
}

/** Preload bridge used by this page. */
export interface DesktopBridge {
  getSnapshot: () => Promise<DesktopSnapshot>
  editHotkey: () => Promise<boolean>
  setLaunchAtLogin: (enabled: boolean) => Promise<void>
  selectProfile: (name: string) => Promise<void>
  createProfile: () => Promise<void>
  checkUpdate: () => void
  onChange: (callback: (snapshot: DesktopSnapshot) => void) => () => void
}

export interface DesktopSectionProps {
  /** Bound translator for this plugin's dictionary. */
  t: (key: DesktopKey) => string
}

/** Read the desktop preload bridge when running inside dsh-desktop. */
function readDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const api = (window as Window & { api?: { desktop?: DesktopBridge } }).api
  return api?.desktop
}

/**
 * Render the Desktop settings page.
 * @param props - inject face (`t`).
 */
export function DesktopSection({ t }: DesktopSectionProps): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = readDesktopBridge()
    if (api === undefined) return
    void api.getSnapshot().then(setSnapshot)
    return api.onChange(setSnapshot)
  }, [])

  const run = (work: () => Promise<void>): void => {
    if (busy) return
    setBusy(true)
    void work().finally(() => {
      setBusy(false)
    })
  }

  const api = readDesktopBridge()
  if (api === undefined) return null

  return (
    <div data-dsh-desktop-settings="">
      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('hotkeyTitle')}</h2>
        <p data-dsh-ds-hint="">{t('hotkeyDescription')}</p>
        <div data-dsh-ds-row="">
          <span data-dsh-ds-value="">{snapshot?.hotkeyLabel ?? '…'}</span>
          <button
            type="button"
            data-dsh-ds-button=""
            disabled={busy}
            onClick={() => {
              run(async () => {
                await api.editHotkey()
              })
            }}
          >
            {t('hotkeyEdit')}
          </button>
        </div>
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('launchTitle')}</h2>
        <div data-dsh-ds-choices="" role="radiogroup" aria-label={t('launchTitle')}>
          <button
            type="button"
            role="radio"
            aria-checked={snapshot?.launchAtLogin === true}
            data-dsh-ds-choice=""
            data-selected={snapshot?.launchAtLogin === true ? '' : undefined}
            disabled={busy || snapshot === null}
            onClick={() => {
              if (snapshot?.launchAtLogin === true) return
              run(async () => {
                await api.setLaunchAtLogin(true)
              })
            }}
          >
            {t('launchOn')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={snapshot?.launchAtLogin === false}
            data-dsh-ds-choice=""
            data-selected={snapshot?.launchAtLogin === false ? '' : undefined}
            disabled={busy || snapshot === null}
            onClick={() => {
              if (snapshot?.launchAtLogin === false) return
              run(async () => {
                await api.setLaunchAtLogin(false)
              })
            }}
          >
            {t('launchOff')}
          </button>
        </div>
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('profileTitle')}</h2>
        <div data-dsh-ds-profiles="" role="radiogroup" aria-label={t('profileTitle')}>
          {(snapshot?.profiles ?? []).map((name) => {
            const selected = name === snapshot?.currentProfile
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                data-dsh-ds-choice=""
                data-selected={selected ? '' : undefined}
                disabled={busy}
                onClick={() => {
                  if (selected) return
                  run(async () => {
                    await api.selectProfile(name)
                  })
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
        <div data-dsh-ds-row="">
          <button
            type="button"
            data-dsh-ds-button=""
            disabled={busy}
            onClick={() => {
              run(async () => {
                await api.createProfile()
              })
            }}
          >
            {t('profileCreate')}
          </button>
        </div>
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('updateTitle')}</h2>
        <div data-dsh-ds-row="">
          <button
            type="button"
            data-dsh-ds-button=""
            disabled={busy}
            onClick={() => {
              api.checkUpdate()
            }}
          >
            {t('updateAction')}
          </button>
        </div>
      </section>
    </div>
  )
}
