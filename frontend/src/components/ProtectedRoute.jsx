import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner fullScreen />;
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}
