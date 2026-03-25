import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until initial auth check completes
  const [user, setUser] = useState(null);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // best-effort
    }
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });

      if (response.ok || response.status === 304) {
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
      } else if (response.status === 401) {
        // Token genuinely invalid/expired — try to refresh via cookie
        const refreshed = await tryRefreshToken();
        if (!refreshed) {
          setIsAuthenticated(false);
          setUser(null);
        }
      } else {
        // 5xx or other transient server errors — keep session state, don't logout.
        console.warn(`[auth] /api/auth/me returned ${response.status} — keeping session`);
      }
    } catch (error) {
      // Network error — do NOT destroy session.
      console.warn('[auth] Network error during auth check — keeping session', error);
    }
  }, []);

  /** Attempt to obtain a new access token using the httpOnly refresh token cookie. */
  const tryRefreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        // Server issued new cookies; re-fetch user
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (meRes.ok) {
          const userData = await meRes.json();
          setUser(userData);
          setIsAuthenticated(true);
          return true;
        }
      }
    } catch {
      // Refresh failed — network error or server down, keep silent
    }
    return false;
  }, []);

  useEffect(() => {
    fetchUser().finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      await fetchUser();
    } else {
      throw new Error('Login failed');
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
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
