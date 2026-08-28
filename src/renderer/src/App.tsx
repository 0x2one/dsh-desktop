import { useEffect, useState } from 'react'

/**
 * Fallback renderer page.
 *
 * The production window normally loads the embedded DeepSeek Harness web UI
 * (`dsh web`); this React page appears only when the service could not start
 * (missing runtimes, spawn failure) or during development before the harness
 * is ready. It surfaces the main process's error message.
 */
function App(): React.JSX.Element {
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('init-error')
    if (error !== null) setInitError(error)
  }, [])

  return (
    <div className="app-fallback">
      <h1>dsh-desktop</h1>
      {initError === null ? (
        <p className="text">Starting DeepSeek Harness…</p>
      ) : (
        <div className="fallback-error">
          <p className="text">DeepSeek Harness could not start:</p>
          <pre className="error-detail">{initError}</pre>
          <p className="text">
            Make sure Node.js 22.19+ (or 24+) and pnpm are installed and on PATH, then restart the
            application.
          </p>
        </div>
      )}
    </div>
  )
}

export default App
