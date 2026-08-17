import { Eye, EyeOff, LockKeyhole, Mail, ReceiptText, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { Brand } from '../components/Brand'
import { supabase } from '../lib/supabase'

export function AuthPage() {
  const [resetMode, setResetMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { session } = useAuth()
  const [, navigate] = useLocation()

  useEffect(() => { if (session) navigate('/', { replace: true }) }, [navigate, session])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (resetMode) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/tetapan-kata-laluan` })
        if (resetError) throw resetError
        setMessage('Pautan tetapan semula telah dihantar ke e-mel kau.')
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (loginError) throw loginError
        navigate('/', { replace: true })
      }
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : 'Log masuk tidak berjaya.'
      setError(raw.toLowerCase().includes('invalid login') ? 'E-mel atau kata laluan tidak tepat.' : raw)
    } finally { setBusy(false) }
  }

  return <main className="min-h-screen lg:grid lg:grid-cols-2">
    <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Brand />
      <div className="max-w-xl"><div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400 text-slate-950"><ReceiptText className="h-8 w-8" /></div><p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">Kos projek sebenar</p><h1 className="mt-4 text-5xl font-black leading-tight">Setiap ringgit, terus kepada projeknya.</h1><p className="mt-5 text-lg leading-8 text-slate-300">Gunakan akaun MRPI Contractor Suite yang sama. Projek dan syarikat sentiasa selari.</p></div>
      <p className="flex items-center gap-3 text-sm text-slate-400"><ShieldCheck className="h-5 w-5 text-emerald-400" />Resit disimpan secara private.</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-8"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><Brand /></div><div className="card p-6 sm:p-8"><p className="eyebrow">Satu akaun MRPI</p><h2 className="mt-2 text-2xl font-black">{resetMode ? 'Tetapkan semula' : 'Log masuk Expenses'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Tiada akaun baharu diperlukan.</p>
      <form onSubmit={submit} className="mt-6 space-y-4"><label><span className="field-label">E-mel</span><span className="relative block"><Mail className="field-icon" /><input className="field-control pl-11" type="email" required autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></span></label>
      {!resetMode && <label><span className="field-label">Kata laluan</span><span className="relative block"><LockKeyhole className="field-icon" /><input className="field-control px-11" type={showPassword?'text':'password'} required minLength={8} autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} /><button type="button" onClick={()=>setShowPassword((v)=>!v)} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-slate-500">{showPassword?<EyeOff className="h-5 w-5"/>:<Eye className="h-5 w-5"/>}</button></span></label>}
      {error && <p className="alert-error" role="alert">{error}</p>}{message && <p className="alert-success">{message}</p>}<button className="btn-primary w-full" disabled={busy}>{busy?'Sila tunggu...':resetMode?'Hantar pautan':'Log masuk'}</button></form>
      <button type="button" onClick={()=>{setResetMode((v)=>!v);setError('');setMessage('')}} className="mt-4 min-h-11 w-full rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">{resetMode?'Kembali ke log masuk':'Lupa kata laluan?'}</button>
    </div></div></section>
  </main>
}
