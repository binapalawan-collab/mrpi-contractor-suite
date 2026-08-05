import {
  Bell,
  BookOpenText,
  Building2,
  ClipboardPenLine,
  FilePlus2,
  Files,
  FolderKanban,
  House,
  Landmark,
  LogOut,
  Menu,
  Settings2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { Brand } from './Brand'

const desktopNav = [
  { to: '/', label: 'Dashboard', icon: House, end: true },
  { to: '/profil', label: 'Profil Syarikat', icon: Building2 },
  { to: '/lawatan-tapak', label: 'Lawatan Tapak', icon: ClipboardPenLine },
  { to: '/sebutharga/baru', label: 'Sebutharga Baru', icon: FilePlus2 },
  { to: '/sebutharga', label: 'Senarai Sebutharga', icon: Files },
  { to: '/projek', label: 'Projek', icon: FolderKanban },
  { to: '/kewangan', label: 'Kewangan', icon: Landmark },
  { to: '/katalog', label: 'Katalog & Harga', icon: BookOpenText },
]

const mobileNav = [
  { to: '/', label: 'Utama', icon: House, end: true },
  { to: '/lawatan-tapak', label: 'Tapak', icon: ClipboardPenLine },
  { to: '/sebutharga/baru', label: 'Quote', icon: FilePlus2, primary: true },
  { to: '/projek', label: 'Projek', icon: FolderKanban },
  { to: '/menu', label: 'Lagi', icon: Menu },
]

function isCurrentPath(currentPath: string, targetPath: string, exact = false) {
  return exact ? currentPath === targetPath : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const [signingOut, setSigningOut] = useState(false)
  const { signOut } = useAuth()
  const [currentPath, navigate] = useLocation()

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside data-app-sidebar className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-8 flex-1 space-y-1" aria-label="Menu utama">
          {desktopNav.map(({ to, label, icon: Icon, end }) => {
            const active = isCurrentPath(currentPath, to, end)
            return (
            <Link
              key={to}
              href={to}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          )})}
        </nav>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          <LogOut className="h-5 w-5" />
          {signingOut ? 'Sedang keluar...' : 'Log keluar'}
        </button>
      </aside>

      <div data-app-content-shell className="lg:pl-72">
        <header data-app-header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur lg:px-8">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-0">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-slate-500">Ruang kerja syarikat</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/notifikasi"
                className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                aria-label="Notifikasi"
              >
                <Bell className="h-5 w-5" />
              </Link>
              <Link
                href="/profil"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-amber-300 hover:bg-slate-800"
                aria-label="Profil syarikat"
              >
                <Settings2 className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        <main data-app-main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      <nav data-mobile-nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_30px_rgb(15_23_42/0.08)] backdrop-blur lg:hidden" aria-label="Navigasi telefon">
        {mobileNav.map(({ to, label, icon: Icon, end, primary }) => {
          const active = isCurrentPath(currentPath, to, end)
          return (
          <Link
            key={to}
            href={to}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition ${
                primary
                  ? '-mt-5 bg-amber-400 text-slate-950 shadow-lg shadow-amber-300/40'
                  : active
                    ? 'text-slate-950'
                    : 'text-slate-500'
              }`}
          >
            <Icon className={primary ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
            {label}
          </Link>
        )})}
      </nav>
    </div>
  )
}
