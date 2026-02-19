// Flag to prevent multiple concurrent refresh attempts
let _refreshing: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if refresh succeeded and a new access token is stored.
 */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const realFetch: typeof fetch = (window as any).__ORIGINAL_FETCH__ || fetch;
    const res = await realFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const newToken = data.accessToken || data.token;
    if (newToken) {
      localStorage.setItem('token', newToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Lightweight fetch wrapper: attaches Authorization and handles 401/403
export async function http(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const realFetch: typeof fetch = (window as any).__ORIGINAL_FETCH__ || fetch;
  const res = await realFetch(input, { ...init, headers });

  // Determine the request URL string for path-based skip logic
  const urlStr =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

  // Skip forced logout/redirect for auth-related endpoints.
  // - /api/auth/me returning 401 is expected during initial load when not logged in
  // - /api/auth/login, /api/auth/register should never trigger a redirect loop
  // - /api/features is a public endpoint
  const isAuthEndpoint = /\/api\/auth\//.test(urlStr) || /\/api\/features/.test(urlStr);

  // Only treat 401 (unauthorized) as an authentication failure. 403 means
  // "forbidden" (insufficient permissions) and should not force a logout in
  // normal authenticated flows — removing the token here caused users who
  // aren't admins to be logged out immediately after a successful login when
  // the client requested an admin-only endpoint and received 403.
  if (res.status === 401 && !isAuthEndpoint) {
    // Attempt to refresh the access token before giving up
    if (!_refreshing) {
      _refreshing = tryRefreshToken().finally(() => {
        _refreshing = null;
      });
    }
    const refreshed = await _refreshing;

    if (refreshed) {
      // Retry the original request with the new token
      const newToken = localStorage.getItem('token');
      const retryHeaders = new Headers(init.headers || {});
      if (newToken) {
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
      }
      return realFetch(input, { ...init, headers: retryHeaders });
    }

    // Refresh failed — clear tokens and redirect to login
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    } catch {}
    // Redirect to login preserving a basic return path
    const current = window.location.pathname + window.location.search;
    // Don't redirect if already on the login/register page
    if (!current.startsWith('/login') && !current.startsWith('/register')) {
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('redirect', current);
      window.location.replace(url.toString());
    }
    // Return a rejected promise to stop further handling
    throw new Error(`Auth error: ${res.status}`);
  }

  return res;
}
