/**
 * Node half of the dsh-desktop window-controls plugin.
 *
 * The browser half is what matters: it registers the window controls into the
 * harness web UI's `shell.overlay` slot. This node half exists so the Loader
 * has an entry to mount (the client-modules scanner discovers the browser
 * half from the active loader entries).
 */

/** Host plugin body — no host-side behavior for this UI plugin. */
export function apply(): void {}
