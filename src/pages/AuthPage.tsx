import { Eye, EyeOff, Hammer, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Brand } from '../components/Brand'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'register' | 'reset'

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'E-mel atau kata laluan tidak tepat.'
  if (normalized.includes('user already registered')) return 'E-mel ini sudah didaftarkan. Cuba log masuk.'
  if (normalized.includes('password should be')) return 'Kata laluan belum memenuhi syarat keselamatan.'
  if (normalized.includes('email rate limit')) return 'Terlalu banyak percubaan. Tunggu sebentar dan cuba lagi.'
  return message
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!session) return
    const requestedPath = (location.state as { from?: string } | null)?.from
    navigate(requestedPath || '/', { replace: true })
  }, [location.state, navigate, session])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setError('')
    setNotice('')

    if (mode === 'register' && password !== confirmPassword) {
      setError('Pengesahan kata laluan tidak sepadan.')
      return
    }

    try {
      setBusy(true)

      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/tetapan-kata-laluan`,
        })
        if (resetError) throw resetError
        setNotice('Pautan tetapan semula telah dihantar. Semak peti masuk e-mel kau.')
        return
      }

      if (mode === 'register') {
        if (password.length < 8) {
          setError('Gunakan sekurang-kurangnya 8 aksara untuk kata laluan.')
          return
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/profil` },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setNotice('Akaun telah dibuat. Buka e-mel pengesahan sebelum log masuk.')
          return
        }
        navigate('/profil', { replace: true })
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      navigate('/', { replace: true })
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Tindakan tidak berjaya.'
      setError(friendlyAuthError(message))
    } finally {
      setBusy(false)
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div className="max-w-xl">
          <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-slate-950">
            <Hammer className="h-8 w-8" />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-amber-300">Dibina untuk kontraktor</p>
          <h1 className="mt-4 text-5xl font-black leading-tight tracking-tight">
            Dari lawatan tapak hingga serah kunci.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
            Catatan, sebutharga, projek dan kewangan berada dalam satu aliran kerja yang praktikal.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Data setiap syarikat diasingkan melalui polisi pangkalan data.
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-8">
            <h2 className="text-2xl font-black tracking-tight">
              {mode === 'login' ? 'Selamat kembali' : mode === 'register' ? 'Daftar syarikat' : 'Tetapkan semula'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {mode === 'login'
                ? 'Log masuk menggunakan akaun pemilik syarikat.'
                : mode === 'register'
                  ? 'Satu akaun mewakili satu syarikat.'
                  : 'Masukkan e-mel yang digunakan semasa mendaftar.'}
            </p>

            {mode !== 'reset' && (
              <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className={`min-h-11 rounded-lg text-sm font-bold ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                >
                  Log Masuk
                </button>
                <button
                  type="button"
                  onClick={() => changeMode('register')}
                  className={`min-h-11 rounded-lg text-sm font-bold ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                >
                  Daftar
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="field-label">E-mel</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="field-control pl-11"
                    placeholder="nama@syarikat.com"
                  />
                </span>
              </label>

              {mode !== 'reset' && (
                <label className="block">
                  <span className="field-label">Kata laluan</span>
                  <span className="relative block">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="field-control px-11"
                      placeholder="Minimum 8 aksara"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-label={showPassword ? 'Sembunyikan kata laluan' : 'Paparkan kata laluan'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </span>
                </label>
              )}

              {mode === 'register' && (
                <label className="block">
                  <span className="field-label">Ulang kata laluan</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="field-control"
                  />
                </label>
              )}

              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</p>}

              <button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? 'Sila tunggu...'
                  : mode === 'login'
                    ? 'Log Masuk'
                    : mode === 'register'
                      ? 'Daftar Akaun'
                      : 'Hantar Pautan'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}
              className="mt-5 min-h-11 w-full rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            >
              {mode === 'reset' ? 'Kembali ke log masuk' : 'Lupa kata laluan?'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

