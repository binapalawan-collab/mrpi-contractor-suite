import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { loading, session } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen label="Memeriksa sesi..." />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

