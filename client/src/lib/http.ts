// Capture the native fetch at module-init time, before setup-fetch.ts can override
// window.fetch. All calls in this module must use _nativeFetch to avoid the infinite
// recursion: window.fetch → http() → window.fetch → ...
const _nativeFetch = fetch;

// Flag to prevent multiple concurrent refresh attempts
let _refreshing: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored HttpOnly refresh-token cookie.
 * Returns true if the server issued new cookies.
 */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await _nativeFetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Lightweight fetch wrapper: sends cookies automatically and handles 401
export async function http(input: RequestInfo | URL, init: RequestInit = {}) {
  // Always include credentials so HttpOnly auth cookies are forwarded
  const res = await _nativeFetch(input, { ...init, credentials: 'include' });

  // Determine the request URL string for path-based skip logic
  const urlStr =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

  // Skip forced logout/redirect for auth-related endpoints.
  // - /api/auth/me returning 401 is expected during initial load when not logged in
  // - /api/auth/login, /api/auth/register should never trigger a redirect loop
  // - /api/features is a public endpoint
  const isAuthEndpoint = /\/api\/auth\//.test(urlStr) || /\/api\/features/.test(urlStr);

  // Only treat 401 (unauthorized) as an authentication failure. 403 means
  // "forbidden" (insufficient permissions) and should not force a logout.
  if (res.status === 401 && !isAuthEndpoint) {
    // Attempt to refresh the access token using the cookie before giving up
    if (!_refreshing) {
      _refreshing = tryRefreshToken().finally(() => {
        _refreshing = null;
      });
    }
    const refreshed = await _refreshing;

    if (refreshed) {
      // Retry with the new cookies the server just set
      return _nativeFetch(input, { ...init, credentials: 'include' });
    }

    // Refresh failed — redirect to login
    const current = window.location.pathname + window.location.search;
    if (!current.startsWith('/login') && !current.startsWith('/register')) {
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('redirect', current);
      window.location.replace(url.toString());
    }
    throw new Error(`Auth error: ${res.status}`);
  }

  return res;
}
