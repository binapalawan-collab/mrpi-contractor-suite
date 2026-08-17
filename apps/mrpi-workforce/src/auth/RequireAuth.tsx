import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from './AuthProvider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true })
  }, [loading, navigate, session])

  if (loading) return <LoadingScreen label="Memeriksa sesi..." />

  if (!session) return <LoadingScreen label="Membuka halaman log masuk..." />

  return children
}
