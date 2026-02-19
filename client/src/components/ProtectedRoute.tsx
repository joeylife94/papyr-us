import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  // Allow E2E to bypass client-side guard when server gates are enforced
  const bypass = typeof window !== 'undefined' && (window as any).__E2E_BYPASS_PROTECTED__;
  if (bypass) return <Outlet />;

  // While auth is still being determined, show a minimal loading indicator
  // instead of flash-redirecting to /login.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAuthenticated) return <Outlet />;

  // Preserve the current URL as a redirect parameter so user can return after login
  const redirectPath = location.pathname + location.search;
  const loginUrl =
    redirectPath && redirectPath !== '/'
      ? `/login?redirect=${encodeURIComponent(redirectPath)}`
      : '/login';
  return <Navigate to={loginUrl} replace />;
}
