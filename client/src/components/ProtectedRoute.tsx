import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  // Allow E2E to bypass client-side guard when server gates are enforced
  const bypass = typeof window !== 'undefined' && (window as any).__E2E_BYPASS_PROTECTED__;
  if (bypass) return <Outlet />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
