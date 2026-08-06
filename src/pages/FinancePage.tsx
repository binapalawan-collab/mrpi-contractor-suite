import { Banknote, CalendarClock, CheckCircle2, Files, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  formatInvoiceDate,
  invoiceStatusLabel,
  invoiceStatusTone,
  isInvoiceOverdue,
  type Invoice,
  type InvoicePayment,
} from '../lib/invoice'
import type { Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'

type Filter = 'all' | 'outstanding' | 'paid' | 'draft'

export function FinancePage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<InvoicePayment[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadFinance() {
      setLoading(true)
      setError('')
      const { data: company, error: companyError } = await client
        .from('companies')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }

      const [projectResult, invoiceResult, paymentResult] = await Promise.all([
        client.from('projects').select('*').eq('company_id', company.id).order('updated_at', { ascending: false }),
        client.from('invoices').select('*').eq('company_id', company.id).order('invoice_date', { ascending: false }).order('id', { ascending: false }),
        client.from('invoice_payments').select('*').eq('company_id', company.id).order('payment_date', { ascending: false }).order('id', { ascending: false }),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? invoiceResult.error ?? paymentResult.error
      if (loadError) setError(loadError.message)
      else {
        setProjects(projectResult.data ?? [])
        setInvoices(invoiceResult.data ?? [])
        setPayments(paymentResult.data ?? [])
      }
      setLoading(false)
    }

    void loadFinance()
    return () => { mounted = false }
  }, [user])

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ms-MY')
    return invoices.filter((invoice) => {
      if (filter === 'outstanding' && invoice.status !== 'issued' && invoice.status !== 'partially_paid') return false
      if (filter === 'paid' && invoice.status !== 'paid') return false
      if (filter === 'draft' && invoice.status !== 'draft') return false
      const project = projectMap.get(invoice.project_id)
      if (!query) return true
      return [invoice.invoice_no, invoice.title, project?.project_no, project?.project_name, project?.client_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('ms-MY').includes(query))
    })
  }, [filter, invoices, projectMap, search])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan kewangan...</div>

  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void')
  const billed = activeInvoices.reduce((total, invoice) => total + Number(invoice.total_amount), 0)
  const paid = payments.reduce((total, payment) => total + Number(payment.amount), 0)
  const outstanding = activeInvoices.reduce((total, invoice) => total + Number(invoice.balance_amount), 0)

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header>
        <p className="text-sm font-bold text-amber-700">Invois, bayaran separa dan resit</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Kewangan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Invois baharu dibuat daripada halaman Projek supaya pelanggan, nilai kontrak dan VO sentiasa datang daripada rujukan yang betul.</p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Ringkasan kewangan">
        <Summary icon={<Files />} label="Diinvois" value={formatMoney(billed)} tone="bg-blue-100 text-blue-800" />
        <Summary icon={<CheckCircle2 />} label="Diterima" value={formatMoney(paid)} tone="bg-emerald-100 text-emerald-800" />
        <Summary icon={<CalendarClock />} label="Belum bayar" value={formatMoney(outstanding)} tone="bg-amber-100 text-amber-800" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder="Cari invois, projek atau pelanggan" /></div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([['all', 'Semua'], ['outstanding', 'Belum Bayar'], ['paid', 'Dibayar'], ['draft', 'Draf']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ${filter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
        </div>
      </section>

      {visible.length ? <section className="grid gap-3 md:grid-cols-2">{visible.map((invoice) => {
        const project = projectMap.get(invoice.project_id)
        const overdue = isInvoiceOverdue(invoice)
        return <Link key={invoice.id} href={`/projek/${invoice.project_id}/invois/${invoice.id}`} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${invoiceStatusTone(invoice.status)}`}>{invoiceStatusLabel(invoice.status)}</span>{overdue && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-800">Lewat</span>}</div><p className="mt-3 text-lg font-black">{invoice.invoice_no}</p></div><Banknote className="h-6 w-6 text-slate-300 group-hover:text-amber-700" /></div>
          <p className="mt-3 font-black">{project?.client_name ?? 'Pelanggan'}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{project?.project_no} · {project?.project_name}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Jumlah</p><p className="mt-1 font-black">{formatMoney(Number(invoice.total_amount))}</p></div><div className="text-right"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Baki</p><p className={`mt-1 font-black ${Number(invoice.balance_amount) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(Number(invoice.balance_amount))}</p></div></div>
          <p className="mt-3 text-xs font-semibold text-slate-400">{formatInvoiceDate(invoice.invoice_date)}{invoice.due_date ? ` · Akhir ${formatInvoiceDate(invoice.due_date)}` : ''}</p>
        </Link>
      })}</section> : <section className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Files className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 font-black">Tiada invois ditemui</h2><p className="mt-2 text-sm leading-6 text-slate-500">Buka mana-mana Projek dan tekan “+ Invois Progress” untuk bermula.</p></section>}
    </div>
  )
}

function Summary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5 ${tone}`}>{icon}</div><p className="mt-3 truncate text-sm font-black sm:text-lg">{value}</p><p className="mt-1 text-[10px] font-bold text-slate-500 sm:text-xs">{label}</p></article>
}
