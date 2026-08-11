import { Banknote, CalendarClock, CheckCircle2, ChevronRight, FileSpreadsheet, Files, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { agingSummary, isPostedInvoice, projectFinanceSummary } from '../lib/finance'
import { formatInvoiceDate, invoiceStatusLabel, invoiceStatusTone, isInvoiceOverdue, type Invoice, type InvoicePayment } from '../lib/invoice'
import type { Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'

type Filter = 'all' | 'outstanding' | 'overdue' | 'paid' | 'draft'

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
      const { data: company, error: companyError } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
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
  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices])
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ms-MY')
    return invoices.filter((invoice) => {
      if (filter === 'outstanding' && invoice.status !== 'issued' && invoice.status !== 'partially_paid') return false
      if (filter === 'overdue' && !isInvoiceOverdue(invoice)) return false
      if (filter === 'paid' && invoice.status !== 'paid') return false
      if (filter === 'draft' && invoice.status !== 'draft') return false
      const project = projectMap.get(invoice.project_id)
      if (!query) return true
      return [invoice.invoice_no, invoice.title, project?.project_no, project?.project_name, project?.client_name].filter(Boolean).some((value) => value!.toLocaleLowerCase('ms-MY').includes(query))
    })
  }, [filter, invoices, projectMap, search])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan kewangan...</div>

  const activeInvoices = invoices.filter(isPostedInvoice)
  const billed = activeInvoices.reduce((total, invoice) => total + Number(invoice.total_amount), 0)
  const paid = payments.reduce((total, payment) => total + Number(payment.amount), 0)
  const outstanding = activeInvoices.reduce((total, invoice) => total + Number(invoice.balance_amount), 0)
  const aging = agingSummary(invoices)
  const projectSummaries = projects.map((project) => ({
    project,
    summary: projectFinanceSummary(project, invoices.filter((invoice) => invoice.project_id === project.id), payments.filter((payment) => payment.project_id === project.id)),
  })).filter(({ summary }) => summary.billed > 0 || summary.received > 0)

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header><p className="text-sm font-bold text-amber-700">Invois, bayaran, resit dan penyata</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Pusat Kewangan</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Semua angka datang terus daripada projek, invois yang dikeluarkan dan resit bayaran. Draf serta invois batal tidak mempengaruhi jumlah kewangan.</p></header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Ringkasan kewangan">
        <Summary icon={<Files />} label="Diinvois" value={formatMoney(billed)} tone="bg-blue-100 text-blue-800" />
        <Summary icon={<CheckCircle2 />} label="Diterima" value={formatMoney(paid)} tone="bg-emerald-100 text-emerald-800" />
        <Summary icon={<CalendarClock />} label="Belum bayar" value={formatMoney(outstanding)} tone="bg-amber-100 text-amber-800" />
      </section>

      {outstanding > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div><p className="text-sm font-bold text-amber-700">Umur tunggakan</p><h2 className="mt-1 text-lg font-black">Baki mengikut tempoh</h2></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><AgingCard label="Belum lewat" value={aging.current} /><AgingCard label="1–30 hari" value={aging.days_1_30} /><AgingCard label="31–60 hari" value={aging.days_31_60} /><AgingCard label="61+ hari" value={aging.days_61_plus} danger={aging.days_61_plus > 0} /></div></section>}

      {projectSummaries.length > 0 && <section><div className="mb-3"><p className="text-sm font-bold text-amber-700">Mengikut projek</p><h2 className="mt-1 text-xl font-black">Penyata Akaun</h2><p className="mt-1 text-sm leading-6 text-slate-500">Buka penyata untuk semak baki berjalan atau simpan PDF bagi pelanggan.</p></div><div className="grid gap-3 md:grid-cols-2">{projectSummaries.map(({ project, summary }) => <Link key={project.id} href={`/projek/${project.id}/penyata`} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-amber-700">{project.project_no}</p><h3 className="mt-1 line-clamp-1 font-black">{project.project_name}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{project.client_name}</p></div><FileSpreadsheet className="h-6 w-6 text-slate-300 group-hover:text-amber-700" /></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-xs"><MiniMetric label="Invois" value={summary.billed} /><MiniMetric label="Diterima" value={summary.received} /><MiniMetric label="Baki" value={summary.outstanding} accent /></div><p className="mt-4 flex items-center justify-end gap-1 text-xs font-black text-amber-800">Buka penyata <ChevronRight className="h-4 w-4" /></p></Link>)}</div></section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder="Cari invois, projek atau pelanggan" /></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{([['all', 'Semua'], ['outstanding', 'Belum Bayar'], ['overdue', 'Lewat'], ['paid', 'Dibayar'], ['draft', 'Draf']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ${filter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div></section>

      {visible.length ? <section className="grid gap-3 md:grid-cols-2">{visible.map((invoice) => {
        const project = projectMap.get(invoice.project_id)
        const overdue = isInvoiceOverdue(invoice)
        return <Link key={invoice.id} href={`/projek/${invoice.project_id}/invois/${invoice.id}`} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${invoiceStatusTone(invoice.status)}`}>{invoiceStatusLabel(invoice.status)}</span>{overdue && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-800">Lewat</span>}</div><p className="mt-3 text-lg font-black">{invoice.invoice_no}</p></div><Banknote className="h-6 w-6 text-slate-300 group-hover:text-amber-700" /></div><p className="mt-3 font-black">{project?.client_name ?? 'Pelanggan'}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{project?.project_no} · {project?.project_name}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Jumlah</p><p className="mt-1 font-black">{formatMoney(Number(invoice.total_amount))}</p></div><div className="text-right"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Baki</p><p className={`mt-1 font-black ${Number(invoice.balance_amount) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(Number(invoice.balance_amount))}</p></div></div><p className="mt-3 text-xs font-semibold text-slate-400">{formatInvoiceDate(invoice.invoice_date)}{invoice.due_date ? ` · Akhir ${formatInvoiceDate(invoice.due_date)}` : ''}</p></Link>
      })}</section> : <section className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Files className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 font-black">Tiada invois ditemui</h2><p className="mt-2 text-sm leading-6 text-slate-500">Buka mana-mana Projek dan tekan “+ Invois Progress” untuk bermula.</p></section>}

      {payments.length > 0 && <section><div className="mb-3"><p className="text-sm font-bold text-emerald-700">Kutipan terbaru</p><h2 className="mt-1 text-xl font-black">Bayaran & resit</h2></div><div className="space-y-2">{payments.slice(0, 5).map((payment) => { const invoice = invoiceMap.get(payment.invoice_id); const project = projectMap.get(payment.project_id); return <Link key={payment.id} href={`/projek/${payment.project_id}/invois/${payment.invoice_id}/bayaran/${payment.id}/cetak`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="min-w-0"><p className="truncate font-black">{payment.receipt_no}</p><p className="mt-1 truncate text-xs text-slate-500">{project?.client_name} · {invoice?.invoice_no}</p></div><div className="shrink-0 text-right"><p className="font-black text-emerald-700">{formatMoney(Number(payment.amount))}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{formatInvoiceDate(payment.payment_date)}</p></div></Link> })}</div></section>}
    </div>
  )
}

function Summary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) { return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5 ${tone}`}>{icon}</div><p className="mt-3 truncate text-sm font-black sm:text-lg">{value}</p><p className="mt-1 text-[10px] font-bold text-slate-500 sm:text-xs">{label}</p></article> }
function AgingCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <article className={`rounded-2xl p-3 ${danger ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-800'}`}><p className="text-[10px] font-black text-slate-500">{label}</p><p className="mt-2 text-sm font-black sm:text-base">{formatMoney(value)}</p></article> }
function MiniMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className="min-w-0"><p className="truncate text-[9px] font-black uppercase text-slate-400">{label}</p><p className={`mt-1 truncate font-black ${accent ? 'text-amber-700' : 'text-slate-800'}`}>{formatMoney(value)}</p></div> }
