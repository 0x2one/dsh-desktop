/**
 * Shared parsing and index fetch for `dsh web` readiness.
 *
 * 0.1.5-rc.2 prints an authenticated loopback URL (`/?token=...`) and may
 * append a LAN URL after whitespace. Index HTML is only served after that
 * process token is exchanged for the session cookie.
 */

/** First loopback URL on a `dsh web:` readiness line, including `?token=`. */
export const DSH_WEB_READY = /dsh web: (http:\/\/127\.0\.0\.1:\d+\S*)/

/**
 * Load the served index after exchanging the printed process token.
 * @param url - authenticated (or already-clean) dsh web URL.
 * @returns index HTML, or the unauthenticated body if the exchange fails.
 */
export async function fetchDshIndex(url) {
  const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
  if (login.status === 200) return login.text()
  const setCookie = login.headers.get('set-cookie')
  if (login.status !== 303 || setCookie === null) return login.text()
  const cookie = setCookie.split(';', 1)[0] ?? ''
  const index = await fetch(new URL('/', url), {
    headers: cookie === '' ? undefined : { cookie },
    signal: AbortSignal.timeout(5_000)
  })
  return index.text()
}
