import { Bell, BookOpenText, ClipboardPenLine, Files, FolderKanban, Landmark } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthPage } from './pages/AuthPage'
import { CompanyProfilePage } from './pages/CompanyProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { MoreMenuPage } from './pages/MoreMenuPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'
import { UpdatePasswordPage } from './pages/UpdatePasswordPage'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequiredPage />

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/tetapan-kata-laluan" element={<UpdatePasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="profil" element={<CompanyProfilePage />} />
            <Route path="lawatan-tapak" element={<PlaceholderPage title="Lawatan Tapak" description="Mod catatan bebas mengikut kawasan kerja, gambar, ukuran dan panduan item popular akan dibina di sini." milestone="Milestone 3" icon={ClipboardPenLine} />} />
            <Route path="sebutharga/baru" element={<PlaceholderPage title="Sebutharga Baru" description="Aliran pelanggan, alamat projek, kawasan kerja dan pemilihan item katalog akan dibina di sini." milestone="Milestone 1" icon={Files} />} />
            <Route path="sebutharga" element={<PlaceholderPage title="Senarai Sebutharga" description="Draf, versi semakan, sebutharga dihantar dan status diterima akan dikendalikan di sini." milestone="Milestone 1" icon={Files} />} />
            <Route path="projek" element={<PlaceholderPage title="Projek" description="Projek aktif, jadual bayaran, VO, invois dan kemajuan kerja akan dipusatkan di sini." milestone="Milestone 2" icon={FolderKanban} />} />
            <Route path="kewangan" element={<PlaceholderPage title="Kewangan" description="Invois, bayaran separa, peruntukan bayaran, resit dan penyata akaun akan dikendalikan di sini." milestone="Milestone 2" icon={Landmark} />} />
            <Route path="katalog" element={<PlaceholderPage title="Katalog & Harga" description="Katalog peribadi setiap syarikat, harga, unit dan import item induk akan dibina di sini." milestone="Milestone 1" icon={BookOpenText} />} />
            <Route path="notifikasi" element={<PlaceholderPage title="Notifikasi" description="Peringatan bayaran, dokumen belum lengkap dan tindakan projek akan dipaparkan di sini." milestone="Milestone 3" icon={Bell} />} />
            <Route path="menu" element={<MoreMenuPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

