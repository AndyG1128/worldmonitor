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

let expiredShown = false;

/** The Jarvis session is gone (refresh token idle/absolute expiry). Say so —
 *  a silently blank dashboard was the 2026-08-22 morning failure — and offer
 *  the one-click way back: the Jarvis app renews the session and reopens us. */
function showSessionExpired(): void {
  if (expiredShown || typeof document === 'undefined') return;
  expiredShown = true;
  const el = document.createElement('div');
  el.id = 'jarvis-session-expired';
  el.setAttribute('role', 'alert');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647', 'display:flex',
    'align-items:center', 'justify-content:center', 'background:rgba(8,10,12,0.92)',
    'color:#e6ebe8', 'font:16px/1.5 system-ui,sans-serif', 'text-align:center', 'padding:2rem',
  ].join(';');
  el.innerHTML = `
    <div style="max-width:36rem">
      <div style="font-size:1.35rem;font-weight:600;margin-bottom:.75rem">Jarvis session expired</div>
      <div style="opacity:.85;margin-bottom:1.25rem">This dashboard rides on your Jarvis login, which has timed out.
      Reopen it from the Jarvis app — the <b>World Monitor</b> entry renews your session and brings you back here.</div>
      <a href="/app/" style="display:inline-block;padding:.6rem 1.1rem;border-radius:6px;background:#2E6E5E;color:#fff;text-decoration:none;font-weight:600">Open the Jarvis app</a>
    </div>`;
  document.body.appendChild(el);
}

async function refreshJarvisSession(): Promise<void> {
  const csrf = readCookie(CSRF_COOKIE);
  if (!csrf) { showSessionExpired(); return; }
  try {
    const resp = await fetch(`${window.location.origin}/api/auth/v2/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
    if (resp.status === 401 || resp.status === 403) showSessionExpired();
  } catch {
    /* offline or gate down — the next tick retries */
  }
}

const REFRESH_WHILE_HIDDEN = import.meta.env.VITE_JARVIS_KEEPALIVE_HIDDEN === '1';

export function installJarvisSessionKeepalive(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.pathname.startsWith(JARVIS_PREFIX)) return;
  // Visible tabs renew every few minutes. Hidden tabs renew only when the
  // build opts in (VITE_JARVIS_KEEPALIVE_HIDDEN=1): renewing in the background
  // keeps a forgotten tab's session alive indefinitely, which defeats the
  // idle expiry — the owner's call, not a default.
  const tick = () => {
    if (document.visibilityState === 'visible' || REFRESH_WHILE_HIDDEN) void refreshJarvisSession();
  };
  window.setInterval(tick, REFRESH_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshJarvisSession();
  });
  window.setTimeout(tick, 15_000);
}
