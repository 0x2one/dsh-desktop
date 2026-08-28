import { useEffect, useState } from 'react'
import Logo from './components/Logo'

/**
 * Fallback renderer page — also the startup (boot) screen.
 *
 * The production window normally loads the embedded DeepSeek Harness web UI
 * (`dsh web`); this React page appears while the service is starting up and
 * when it could not start (missing runtimes, spawn failure).
 *
 * Design: the same plate as the in-app empty hero — centered mark, product
 * name, quiet status — on the official bluish paper with a DeepSeek-blue
 * glow. Follows the OS color scheme so the black (light) / white (dark)
 * whale matches the favicon.
 */
function App(): React.JSX.Element {
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('init-error')
    if (error !== null) setInitError(error)
  }, [])

  const failed = initError !== null

  return (
    <div className="boot" data-state={failed ? 'error' : 'booting'}>
      <div className="boot-glow" aria-hidden="true" />

      <div className="boot-stack">
        <Logo className="boot-logo" />
        <h1 className="boot-title">DeepSeek Harness</h1>
        <section className="boot-status" aria-live="polite">
          {failed ? (
            <div className="boot-error">
              <p className="boot-line boot-line-error">Could Not Start</p>
              <pre className="boot-detail">{initError}</pre>
              <p className="boot-sub">
                Install Node.js 22.19+ (Or 24) And Pnpm, Then Open The App Again.
              </p>
            </div>
          ) : (
            <>
              <p className="boot-line">Starting The Runtime</p>
              <p className="boot-sub">Profile · Node · Pnpm</p>
            </>
          )}
        </section>
      </div>

      <p className="boot-hint">
        {failed
          ? 'Fix the issue above, then open the app again.'
          : 'Keep this window open. The workspace opens here.'}
      </p>
    </div>
  )
}

export default App
