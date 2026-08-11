import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { agingSummary, buildStatementTransactions, projectFinanceSummary, todayDate } from '../lib/finance'
import { formatInvoiceDate, type Invoice, type InvoicePayment } from '../lib/invoice'
import { projectAddress, type Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function ProjectStatementPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<InvoicePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) {
      setError('ID projek tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadStatement() {
      const { data: companyRow, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !companyRow) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [projectResult, invoiceResult, paymentResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('invoices').select('*').eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('invoice_date'),
        client.from('invoice_payments').select('*').eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('payment_date'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? invoiceResult.error ?? paymentResult.error
      if (loadError || !projectResult.data) setError(loadError?.message ?? 'Projek tidak ditemui.')
      else {
        setCompany(companyRow)
        setProject(projectResult.data)
        setInvoices(invoiceResult.data ?? [])
        setPayments(paymentResult.data ?? [])
      }
      setLoading(false)
    }

    void loadStatement()
    return () => { mounted = false }
  }, [projectId, user])

  const transactions = useMemo(() => buildStatementTransactions(invoices, payments), [invoices, payments])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan penyata akaun...</div>
  if (error || !company || !project) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Penyata akaun tidak dapat dibuka.'}</div>

  const summary = projectFinanceSummary(project, invoices, payments)
  const aging = agingSummary(invoices)
  const brand = (company.trading_name || company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = [company.address_line_1, company.address_line_2, [company.postcode, company.city].filter(Boolean).join(' '), company.state].filter(Boolean).join(', ')

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(`/projek/${project.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button>
      </div>

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white">
          <div className="flex items-start justify-between gap-6">
            <div><p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>{company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>{company.phone && <p className="mt-1 text-xs text-slate-300">{company.phone}</p>}</div>
            <div className="text-right"><p className="text-sm font-black tracking-[0.18em] text-amber-300">PENYATA AKAUN</p><p className="mt-2 text-lg font-black">{project.project_no}</p><p className="mt-1 text-xs text-slate-300">Setakat {formatInvoiceDate(todayDate())}</p></div>
          </div>
        </header>

        <div className="px-8 py-8">
          <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-xs">
            <div><p className="font-black uppercase tracking-wide text-slate-400">Pelanggan</p><p className="mt-2 text-sm font-black">{project.client_name}</p><p className="mt-1 font-semibold text-slate-500">{project.client_phone}</p></div>
            <div><p className="font-black uppercase tracking-wide text-slate-400">Projek</p><p className="mt-2 text-sm font-black">{project.project_name}</p><p className="mt-1 leading-5 text-slate-500">{projectAddress(project)}</p></div>
          </section>

          <section className="my-6 grid grid-cols-3 gap-3 text-xs">
            <StatementMetric label="Kontrak asal" value={formatMoney(Number(project.contract_amount))} />
            <StatementMetric label="VO diluluskan" value={formatMoney(Number(project.approved_variation_amount))} />
            <StatementMetric label="Kontrak semasa" value={formatMoney(summary.contractValue)} accent />
            <StatementMetric label="Jumlah diinvois" value={formatMoney(summary.billed)} />
            <StatementMetric label="Jumlah diterima" value={formatMoney(summary.received)} />
            <StatementMetric label="Baki belum bayar" value={formatMoney(summary.outstanding)} accent />
          </section>

          <table className="quotation-table w-full border-collapse text-left text-[11px]">
            <thead><tr className="bg-slate-950 text-white"><th className="px-3 py-3">Tarikh</th><th className="px-3 py-3">Rujukan / Butiran</th><th className="px-3 py-3 text-right">Invois (RM)</th><th className="px-3 py-3 text-right">Bayaran (RM)</th><th className="px-3 py-3 text-right">Baki (RM)</th></tr></thead>
            <tbody>{transactions.map((row) => <tr key={row.key} className="border-b border-slate-200 align-top"><td className="whitespace-nowrap px-3 py-3">{formatInvoiceDate(row.date)}</td><td className="px-3 py-3"><p className="font-black">{row.reference}</p><p className="mt-1 text-slate-500">{row.description}</p></td><td className="px-3 py-3 text-right font-bold">{row.debit ? formatNumber(row.debit) : '—'}</td><td className="px-3 py-3 text-right font-bold text-emerald-700">{row.credit ? formatNumber(row.credit) : '—'}</td><td className="px-3 py-3 text-right font-black">{formatNumber(row.balance)}</td></tr>)}</tbody>
          </table>
          {!transactions.length && <div className="border border-t-0 border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada invois dikeluarkan untuk projek ini.</div>}

          <section className="ml-auto mt-5 w-full max-w-md rounded-2xl bg-slate-950 p-5 text-white"><div className="space-y-3 text-sm"><MoneyRow label="Baki belum bayar" value={formatMoney(summary.outstanding)} tone="text-amber-300 text-xl" /><MoneyRow label="Kontrak belum dituntut" value={formatMoney(summary.unbilled)} /></div></section>

          {summary.outstanding > 0 && <section className="mt-6"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Umur baki belum bayar</p><div className="mt-3 grid grid-cols-4 gap-2"><AgingCell label="Belum lewat" value={aging.current} /><AgingCell label="1–30 hari" value={aging.days_1_30} /><AgingCell label="31–60 hari" value={aging.days_31_60} /><AgingCell label="61+ hari" value={aging.days_61_plus} /></div></section>}

          <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500"><p>Penyata ini dijana daripada invois yang telah dikeluarkan dan resit bayaran yang direkodkan untuk projek ini. Draf serta invois batal tidak dimasukkan.</p><p className="mt-1">Dokumen ini tidak memerlukan tandatangan pelanggan atau tandatangan pengguna sistem.</p></footer>
        </div>
      </article>
    </div>
  )
}

function StatementMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-xl border p-3 ${accent ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><p className="font-bold text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>
}

function MoneyRow({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-5"><p className="font-bold text-slate-300">{label}</p><p className={`font-black ${tone}`}>{value}</p></div>
}

function AgingCell({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-100 p-3 text-center"><p className="text-[9px] font-black text-slate-500">{label}</p><p className="mt-1 text-xs font-black">{formatMoney(value)}</p></div>
}

function formatNumber(value: number) {
  return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
