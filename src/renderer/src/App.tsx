import { useEffect, useState } from 'react'
import Versions from './components/Versions'

/**
 * Fallback renderer page — also the startup (boot) screen.
 *
 * The production window normally loads the embedded DeepSeek Harness web UI
 * (`dsh web`); this React page appears while the service is starting up (the
 * boot screen) and when it could not start (missing runtimes, spawn failure).
 *
 * Design: a left-anchored terminal-banner composition over a deep-sea
 * bathymetry field — contour lines drawn from the DeepSeek "deep" identity,
 * with a slow sonar pulse at the focus. The boot state is a mono status line;
 * the error state surfaces the main process's message in the same voice.
 */
function App(): React.JSX.Element {
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('init-error')
    if (error !== null) setInitError(error)
  }, [])

  return (
    <div className="boot">
      {/* Bathymetry field: contour lines + sonar focus (pure CSS/SVG, see main.css). */}
      <div className="boot-field" aria-hidden="true">
        <div className="boot-sonar" />
      </div>

      <header className="boot-banner">
        <p className="boot-eyebrow">deepseek · harness · desktop</p>
        <h1 className="boot-title">DeepSeek Harness Desktop</h1>
      </header>

      <section className="boot-status" aria-live="polite">
        {initError === null ? (
          <>
            <p className="boot-line">
              <span className="boot-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              starting local harness…
            </p>
            <p className="boot-sub">preparing profile · node · pnpm</p>
          </>
        ) : (
          <div className="boot-error">
            <p className="boot-line boot-line-error">harness could not start</p>
            <pre className="boot-detail">{initError}</pre>
            <p className="boot-sub">
              make sure Node.js 22.19+ (or 24+) and pnpm are installed and on PATH, then restart the
              application.
            </p>
          </div>
        )}
      </section>

      <Versions />
    </div>
  )
}

export default App
