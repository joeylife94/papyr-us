import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    // Render nothing or a simple placeholder while auth state is being determined
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
