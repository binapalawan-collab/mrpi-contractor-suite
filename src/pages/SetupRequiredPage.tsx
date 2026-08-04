import { Cable, ShieldCheck } from 'lucide-react'
import { Brand } from '../components/Brand'

export function SetupRequiredPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <Brand />
        <div className="mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Cable className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Sambungan Supabase belum dipasang</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Aplikasi sudah tersedia, tetapi dua environment variable diperlukan sebelum modul log masuk boleh digunakan.
        </p>
        <div className="mt-5 rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
          <div>VITE_SUPABASE_URL</div>
          <div>VITE_SUPABASE_PUBLISHABLE_KEY</div>
        </div>
        <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Hanya publishable key digunakan pada aplikasi. Secret key dan service role tidak boleh dimasukkan di sini.</p>
        </div>
      </section>
    </main>
  )
}

