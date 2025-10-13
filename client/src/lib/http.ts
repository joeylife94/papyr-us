// Lightweight fetch wrapper: attaches Authorization and handles 401/403
export async function http(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const realFetch: typeof fetch = (window as any).__ORIGINAL_FETCH__ || fetch;
  const res = await realFetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    try {
      localStorage.removeItem('token');
    } catch {}
    // Redirect to login preserving a basic return path
    const current = window.location.pathname + window.location.search;
    const url = new URL('/login', window.location.origin);
    url.searchParams.set('redirect', current);
    window.location.replace(url.toString());
    // Return a rejected promise to stop further handling
    throw new Error(`Auth error: ${res.status}`);
  }

  return res;
}
