/**
 * LOCAL (jarvis-deploy): keep the Jarvis edge session alive while the
 * dashboard is open.
 *
 * This instance is served at yolk.grneggs.com/api/admin/worldmonitor/ behind
 * Jarvis's edge gate. The gate accepts the app's `__Host-jarvis_access`
 * cookie, which lives ~10 minutes and is renewed only by JavaScript calling
 * the refresh endpoint with the double-submit CSRF token. The Jarvis web app
 * does that for itself; a dashboard opened as its own page must do it too,
 * or every request silently starts failing ten minutes in.
 *
 * Uses an ABSOLUTE same-origin URL so the runtime fetch prefix-mode patch
 * (which rewrites relative "/api/..." strings to the dashboard prefix) leaves
 * it alone — this call must reach Jarvis's own /api/auth/v2/refresh.
 */
const JARVIS_PREFIX = '/api/admin/worldmonitor';
const REFRESH_EVERY_MS = 4 * 60 * 1000;
const CSRF_COOKIE = 'jarvis_csrf';

function readCookie(name: string): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

async function refreshJarvisSession(): Promise<void> {
  const csrf = readCookie(CSRF_COOKIE);
  if (!csrf) return;
  try {
    await fetch(`${window.location.origin}/api/auth/v2/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
  } catch {
    /* offline or gate down — the next tick retries */
  }
}

export function installJarvisSessionKeepalive(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.pathname.startsWith(JARVIS_PREFIX)) return;
  const tick = () => { if (document.visibilityState === 'visible') void refreshJarvisSession(); };
  window.setInterval(tick, REFRESH_EVERY_MS);
  document.addEventListener('visibilitychange', tick);
  // First renewal shortly after boot so a page opened late in a session's
  // life doesn't expire before the first interval.
  window.setTimeout(tick, 15_000);
}
