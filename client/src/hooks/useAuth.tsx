import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  login: (email: string, password: string) => Promise<void>;
  socialLogin: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until initial auth check completes
  const [user, setUser] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const fetchUser = useCallback(
    async (token: string) => {
      try {
        // Use the original fetch to bypass the http() monkey-patch, which would
        // hard-redirect on 401 before we get a chance to handle it gracefully.
        const realFetch: typeof fetch = (window as any).__ORIGINAL_FETCH__ || fetch;
        const response = await realFetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok || response.status === 304) {
          const userData = await response.json();
          setUser(userData);
          setIsAuthenticated(true);
        } else if (response.status === 401) {
          // Token genuinely invalid/expired — try to refresh
          const refreshed = await tryRefreshToken();
          if (!refreshed) {
            logout();
          }
        } else {
          // 5xx or other transient server errors — keep the token, don't logout.
          // The user can retry when the server recovers.
          console.warn(`[auth] /api/auth/me returned ${response.status} — keeping session`);
        }
      } catch (error) {
        // Network error (server down, DNS failure, etc.) — do NOT destroy the token.
        // The user still has a valid JWT; once the server is reachable again requests
        // will succeed without forcing a re-login.
        console.warn('[auth] Network error during auth check — keeping session', error);
      }
    },
    [logout]
  );

  /** Attempt to obtain a new access token using the stored refresh token. */
  const tryRefreshToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const realFetch: typeof fetch = (window as any).__ORIGINAL_FETCH__ || fetch;
      const res = await realFetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        const newToken = data.token || data.accessToken;
        if (newToken) {
          localStorage.setItem('token', newToken);
          if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
          // Re-fetch user with the new token
          const meRes = await realFetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${newToken}` },
          });
          if (meRes.ok) {
            const userData = await meRes.json();
            setUser(userData);
            setIsAuthenticated(true);
            return true;
          }
        }
      }
    } catch {
      // Refresh failed — network error or server down, keep silent
    }
    return false;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser(token).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      const token = data.token || data.accessToken;
      localStorage.setItem('token', token);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      return fetchUser(token);
    } else {
      throw new Error('Login failed');
    }
  };

  const socialLogin = async (token: string) => {
    localStorage.setItem('token', token);
    await fetchUser(token);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, socialLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
