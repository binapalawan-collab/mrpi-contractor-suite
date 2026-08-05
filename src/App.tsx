import { Bell, Files, FolderKanban, Landmark } from 'lucide-react'
import { useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthPage } from './pages/AuthPage'
import { CatalogPage } from './pages/CatalogPage'
import { CompanyProfilePage } from './pages/CompanyProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { MoreMenuPage } from './pages/MoreMenuPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SiteVisitPage } from './pages/SiteVisitPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'
import { UpdatePasswordPage } from './pages/UpdatePasswordPage'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequiredPage />

  return (
    <AuthProvider>
      <Switch>
        <Route path="/login"><AuthPage /></Route>
        <Route path="/tetapan-kata-laluan"><UpdatePasswordPage /></Route>
        <Route>
          <RequireAuth>
            <AppShell>
              <ProtectedRoutes />
            </AppShell>
          </RequireAuth>
        </Route>
      </Switch>
    </AuthProvider>
  )
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/"><DashboardPage /></Route>
      <Route path="/profil"><CompanyProfilePage /></Route>
      <Route path="/lawatan-tapak"><SiteVisitPage /></Route>
      <Route path="/sebutharga/baru"><PlaceholderPage title="Sebutharga Baru" description="Aliran pelanggan, alamat projek, kawasan kerja dan pemilihan item katalog akan dibina di sini." milestone="Milestone 1" icon={Files} /></Route>
      <Route path="/sebutharga"><PlaceholderPage title="Senarai Sebutharga" description="Draf, versi semakan, sebutharga dihantar dan status diterima akan dikendalikan di sini." milestone="Milestone 1" icon={Files} /></Route>
      <Route path="/projek"><PlaceholderPage title="Projek" description="Projek aktif, jadual bayaran, VO, invois dan kemajuan kerja akan dipusatkan di sini." milestone="Milestone 2" icon={FolderKanban} /></Route>
      <Route path="/kewangan"><PlaceholderPage title="Kewangan" description="Invois, bayaran separa, peruntukan bayaran, resit dan penyata akaun akan dikendalikan di sini." milestone="Milestone 2" icon={Landmark} /></Route>
      <Route path="/katalog"><CatalogPage /></Route>
      <Route path="/notifikasi"><PlaceholderPage title="Notifikasi" description="Peringatan bayaran, dokumen belum lengkap dan tindakan projek akan dipaparkan di sini." milestone="Milestone 3" icon={Bell} /></Route>
      <Route path="/menu"><MoreMenuPage /></Route>
      <Route><NotFoundRedirect /></Route>
    </Switch>
  )
}

function NotFoundRedirect() {
  const [, navigate] = useLocation()
  useEffect(() => navigate('/', { replace: true }), [navigate])
  return null
}
