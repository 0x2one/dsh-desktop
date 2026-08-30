import { useEffect, useState } from 'react'
import Logo from '../components/Logo'
import { renderNotes } from './notes'
import type { UpdateState } from '../../../preload/update-api'

function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function UpdateApp(): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    const api = window.api.updater
    const stop = api.onState(setState)
    void api.getState().then((next) => {
      if (next !== null) setState(next)
    })
    return stop
  }, [])

  const phase = state?.phase ?? 'checking'
  const current = state?.currentVersion ?? ''
  const next = state?.nextVersion
  const percent = Math.max(0, Math.min(100, state?.progress?.percent ?? 0))
  const crossing = phase === 'available' || phase === 'downloading' || phase === 'ready'
  const nextLabel = crossing
    ? '新版本'
    : phase === 'latest'
      ? '没有更新'
      : phase === 'error'
        ? '未完成'
        : '正在查'
  const nextValue = crossing
    ? (next ?? '…')
    : phase === 'latest'
      ? current || '—'
      : phase === 'error'
        ? '—'
        : '…'

  return (
    <div className="upd" data-phase={phase}>
      <header className="upd-chrome">
        <p className="upd-kicker">版本</p>
        <button
          type="button"
          className="upd-x"
          aria-label="关闭"
          onClick={() => window.api.updater.dismiss()}
        >
          ×
        </button>
      </header>

      <div className="upd-bridge">
        <div className="upd-chip">
          <span className="upd-chip-label">正在使用</span>
          <span className="upd-chip-ver">{current === '' ? '—' : current}</span>
        </div>
        <Logo className="upd-whale" />
        <div className={`upd-chip${crossing ? ' upd-chip-next' : ''}`}>
          <span className="upd-chip-label">{nextLabel}</span>
          <span className="upd-chip-ver">{nextValue}</span>
        </div>
      </div>

      <section className="upd-notes" aria-label="更新说明">
        {phase === 'checking' ? (
          <p className="notes-empty">正在查看有没有新版本。</p>
        ) : phase === 'latest' ? (
          <p className="notes-empty">没有新版本，继续用现在这一版即可。</p>
        ) : phase === 'error' ? (
          <p className="notes-error">{state?.error ?? '查不到更新，也下不下来。请稍后再试。'}</p>
        ) : (
          renderNotes(state?.notes ?? '')
        )}
      </section>

      <footer className="upd-foot">
        {phase === 'downloading' ? (
          <div className="upd-sonar">
            <div className="upd-sonar-track" aria-hidden="true">
              <span className="upd-sonar-fill" style={{ width: `${String(percent)}%` }} />
            </div>
            <p className="upd-sonar-meta">
              已下载 {Math.round(percent)}%
              {state?.progress !== undefined && state.progress.total > 0
                ? ` · ${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)}`
                : ''}
            </p>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <p className="upd-hint">可以继续用。退出应用后，下次启动会装上新版本。</p>
        ) : null}

        {phase === 'available' ? (
          <div className="upd-actions">
            <button type="button" className="upd-btn" onClick={() => window.api.updater.dismiss()}>
              以后再说
            </button>
            <button
              type="button"
              className="upd-btn upd-btn-primary"
              onClick={() => window.api.updater.download()}
            >
              下载
            </button>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <div className="upd-actions">
            <button
              type="button"
              className="upd-btn"
              onClick={() => window.api.updater.installLater()}
            >
              下次启动时安装
            </button>
            <button
              type="button"
              className="upd-btn upd-btn-primary"
              onClick={() => window.api.updater.installNow()}
            >
              现在重启并安装
            </button>
          </div>
        ) : null}

        {phase === 'latest' || phase === 'error' ? (
          <div className="upd-actions">
            <button
              type="button"
              className="upd-btn upd-btn-primary"
              onClick={() => window.api.updater.dismiss()}
            >
              关闭
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  )
}

export default UpdateApp
