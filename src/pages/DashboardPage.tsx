import { ArrowRight, Banknote, ClipboardPenLine, FilePlus2, FolderKanban, Landmark, UserRoundCog } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'

const quickActions = [
  { to: '/lawatan-tapak', label: 'Mula lawatan tapak', help: 'Catat dahulu, lengkapkan kemudian', icon: ClipboardPenLine },
  { to: '/sebutharga/baru', label: 'Buat sebutharga', help: 'Masukkan pelanggan dan kawasan kerja', icon: FilePlus2 },
  { to: '/kewangan', label: 'Semak kewangan', help: 'Invois, bayaran separa dan resit', icon: Landmark },
  { to: '/profil', label: 'Lengkapkan profil', help: 'Maklumat syarikat untuk dokumen PDF', icon: UserRoundCog },
]

export function DashboardPage() {
  const { user } = useAuth()
  const [draftQuotationCount, setDraftQuotationCount] = useState(0)
  const [activeProjectCount, setActiveProjectCount] = useState(0)
  const [outstandingAmount, setOutstandingAmount] = useState(0)

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadSummary() {
      const { data: company } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted || !company) return
      const [quotationResult, projectResult, invoiceResult] = await Promise.all([
        client.from('quotations').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('status', 'draft'),
        client.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', company.id).in('status', ['preparation', 'scheduled', 'active', 'work_completed']),
        client.from('invoices').select('balance_amount').eq('company_id', company.id).in('status', ['issued', 'partially_paid']),
      ])
      if (!mounted) return
      setDraftQuotationCount(quotationResult.count ?? 0)
      setActiveProjectCount(projectResult.count ?? 0)
      setOutstandingAmount((invoiceResult.data ?? []).reduce((total, invoice) => total + Number(invoice.balance_amount), 0))
    }

    void loadSummary()
    return () => { mounted = false }
  }, [user])

  const summaries = [
    { label: 'Sebutharga draf', value: String(draftQuotationCount), icon: FilePlus2, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Projek berjalan', value: String(activeProjectCount), icon: FolderKanban, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Belum dibayar', value: formatMoney(outstandingAmount), icon: Banknote, tone: 'bg-amber-50 text-amber-700' },
  ]

  return (
    <div>
      <section className="rounded-3xl bg-slate-950 px-5 py-7 text-white shadow-xl shadow-slate-300 sm:px-8 sm:py-9">
        <p className="text-sm font-bold text-amber-300">Dashboard</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Selamat datang.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
          Mulakan dengan melengkapkan profil syarikat atau catat lawatan tapak pertama.
        </p>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Ringkasan">
        {summaries.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight">{value}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-amber-700">Tindakan pantas</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">Apa yang mahu dibuat?</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(({ to, label, help, icon: Icon }) => (
            <Link key={to} href={to} className="group flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-950">{label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{help}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-amber-600" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
