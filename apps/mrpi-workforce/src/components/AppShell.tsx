import { CalendarCheck, History, House, LogOut, Plus, UsersRound, WalletCards } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { Brand } from './Brand'

const nav = [
  { to: '/', label: 'Ringkasan', icon: House, exact: true },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/workers', label: 'Pekerja', icon: UsersRound },
  { to: '/wages', label: 'Upah', icon: WalletCards },
  { to: '/history', label: 'Sejarah', icon: History },
]

const mobile = [
  { to: '/', label: 'Utama', icon: House, exact: true },
  { to: '/workers', label: 'Pekerja', icon: UsersRound },
  { to: '/attendance', label: 'Check-in', icon: Plus, primary: true },
  { to: '/wages', label: 'Upah', icon: WalletCards },
  { to: '/history', label: 'Sejarah', icon: History },
]

const active = (current: string, target: string, exact?: boolean) => exact ? current === target : current === target || current.startsWith(`${target}/`)

export function AppShell({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const { signOut } = useAuth()
  const [path, navigate] = useLocation()

  async function logout() {
    setBusy(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <aside className="workforce-shell-aside fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
      <Brand />
      <p className="mt-7 px-3 text-[11px] font-black uppercase tracking-[.18em] text-slate-400">Pekerja & upah</p>
      <nav className="mt-3 flex-1 space-y-1">{nav.map(({ to, label, icon: Icon, exact }) => <Link key={to} href={to} className={`nav-link ${active(path, to, exact) ? 'nav-link-active' : ''}`}><Icon className="h-5 w-5" />{label}</Link>)}</nav>
      <button onClick={logout} disabled={busy} className="nav-link text-rose-700"><LogOut className="h-5 w-5" />{busy ? 'Sedang keluar...' : 'Log keluar'}</button>
    </aside>
    <div className="workforce-shell-content lg:pl-72">
      <header className="workforce-shell-header sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="lg:hidden"><Brand compact /></div>
          <p className="hidden text-sm font-semibold text-slate-500 lg:block">MRPI Resources · Ruang workforce</p>
          <Link href="/attendance" className="hidden min-h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-black text-white hover:bg-sky-700 sm:flex"><CalendarCheck className="h-4 w-4" />Attendance hari ini</Link>
        </div>
      </header>
      <main className="workforce-shell-main mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
    </div>
    <nav className="workforce-shell-mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_30px_rgb(15_23_42/0.08)] backdrop-blur lg:hidden">
      {mobile.map(({ to, label, icon: Icon, primary, exact }) => <Link key={to} href={to} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${primary ? '-mt-5 bg-sky-600 text-white shadow-lg shadow-sky-200' : active(path, to, exact) ? 'text-sky-700' : 'text-slate-500'}`}><Icon className={primary ? 'h-6 w-6' : 'h-5 w-5'} />{label}</Link>)}
    </nav>
  </div>
}
