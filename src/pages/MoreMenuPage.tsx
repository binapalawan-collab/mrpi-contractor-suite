import { BookOpenText, Building2, Files, Landmark, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const items = [
  { to: '/profil', label: 'Profil Syarikat', icon: Building2 },
  { to: '/sebutharga', label: 'Senarai Sebutharga', icon: Files },
  { to: '/kewangan', label: 'Kewangan', icon: Landmark },
  { to: '/katalog', label: 'Katalog & Harga', icon: BookOpenText },
]

export function MoreMenuPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <section>
      <h1 className="text-2xl font-black tracking-tight">Menu</h1>
      <div className="mt-5 space-y-3">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-16 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 font-bold shadow-sm">
            <Icon className="h-5 w-5 text-amber-700" />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
          className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 font-bold text-red-700"
        >
          <LogOut className="h-5 w-5" />
          Log keluar
        </button>
      </div>
    </section>
  )
}

