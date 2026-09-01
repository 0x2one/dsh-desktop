/**
 * Node half of the dsh-desktop settings plugin.
 *
 * The browser half is what matters: it registers a "Desktop" page into the
 * harness settings panel. This node half exists so the Loader has an entry
 * to mount (the client-modules scanner discovers the browser half from the
 * active loader entries).
 */

/** Host plugin body — no host-side behavior for this UI plugin. */
export function apply(): void {
  return
}
