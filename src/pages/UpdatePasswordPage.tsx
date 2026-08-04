import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Brand } from '../components/Brand'
import { supabase } from '../lib/supabase'

export function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 8) return setError('Gunakan sekurang-kurangnya 8 aksara.')
    if (password !== confirmPassword) return setError('Pengesahan kata laluan tidak sepadan.')

    try {
      setBusy(true)
      setError('')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      navigate('/', { replace: true })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Kata laluan tidak dapat dikemas kini.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <Brand />
        <h1 className="mt-8 text-2xl font-black">Kata laluan baharu</h1>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Memeriksa pautan...</p>
        ) : !session ? (
          <div className="mt-5">
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Pautan ini tidak sah atau telah tamat tempoh.</p>
            <Link to="/login" className="mt-4 inline-flex min-h-11 items-center font-bold text-slate-950">Kembali ke log masuk</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Kata laluan baharu</span>
              <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="field-control" />
            </label>
            <label className="block">
              <span className="field-label">Ulang kata laluan</span>
              <input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="field-control" />
            </label>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-60">
              {busy ? 'Menyimpan...' : 'Simpan Kata Laluan'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

