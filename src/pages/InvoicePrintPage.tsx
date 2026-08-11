import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  formatInvoiceDate,
  invoiceSourceLabel,
  invoiceStatusLabel,
  parseInvoiceSnapshot,
  type Invoice,
  type InvoiceDocumentSnapshot,
  type InvoiceItem,
} from '../lib/invoice'
import { type Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function InvoicePrintPage({ projectId, invoiceId }: { projectId: string; invoiceId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [snapshot, setSnapshot] = useState<InvoiceDocumentSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    const numericInvoiceId = Number(invoiceId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0 || !Number.isInteger(numericInvoiceId) || numericInvoiceId <= 0) {
      setError('ID projek atau invois tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadDocument() {
      const { data: companyRow, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !companyRow) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [projectResult, invoiceResult, itemResult, snapshotResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('invoices').select('*').eq('id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('invoice_items').select('*').eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('sort_order').order('id'),
        client.from('invoice_snapshots').select('snapshot_data').eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? invoiceResult.error ?? itemResult.error ?? snapshotResult.error
      if (loadError || !projectResult.data || !invoiceResult.data) setError(loadError?.message ?? 'Dokumen invois tidak ditemui.')
      else {
        const parsed = snapshotResult.data ? parseInvoiceSnapshot(snapshotResult.data.snapshot_data) : null
        if (invoiceResult.data.status !== 'draft' && invoiceResult.data.status !== 'void' && !parsed) setError('Snapshot invois yang telah dikeluarkan tidak ditemui.')
        else {
          setCompany(companyRow)
          setProject(projectResult.data)
          setInvoice(invoiceResult.data)
          setItems(itemResult.data ?? [])
          setSnapshot(parsed)
        }
      }
      setLoading(false)
    }

    void loadDocument()
    return () => { mounted = false }
  }, [invoiceId, projectId, user])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan invois...</div>
  if (error || !company || !project || !invoice) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Dokumen tidak dapat dibuka.'}</div>

  const document = snapshot ?? liveDocument(company, project, invoice, items)
  const brand = (document.company.trading_name || document.company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = [document.company.address_line_1, document.company.address_line_2, [document.company.postcode, document.company.city].filter(Boolean).join(' '), document.company.state].filter(Boolean).join(', ')
  const projectAddress = [document.project.address_line_1, document.project.address_line_2, [document.project.postcode, document.project.city].filter(Boolean).join(' '), document.project.state].filter(Boolean).join(', ')
  const bankName = document.company.bank_name ?? company.bank_name
  const bankAccountName = document.company.bank_account_name ?? company.bank_account_name
  const bankAccountNo = document.company.bank_account_no ?? company.bank_account_no
  const hasBankDetails = Boolean(bankName || bankAccountName || bankAccountNo)

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => navigate(`/projek/${project.id}/invois/${invoice.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button><button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button></div>
      {!hasBankDetails && <p className="no-print mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Maklumat akaun bank belum lengkap. Isi di Profil Syarikat supaya ia dipaparkan dalam invois.</p>}

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white"><div className="flex items-start justify-between gap-6"><div><p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>{document.company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{document.company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>{document.company.phone && <p className="mt-1 text-xs text-slate-300">{document.company.phone}</p>}</div><div className="text-right"><p className="text-sm font-black tracking-[0.2em] text-amber-300">INVOIS</p><p className="mt-2 text-lg font-black">{document.invoice.invoice_no}</p><p className="mt-1 text-xs text-slate-300">{formatLongDate(document.invoice.invoice_date)}</p><p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-black">{invoiceStatusLabel(invoice.status)}</p></div></div></header>

        <div className="px-8 py-7">
          <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-sm"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Dituntut daripada</p><p className="mt-2 text-lg font-black">{document.project.client_name}</p><p className="mt-1 text-slate-600">{document.project.client_phone}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Projek</p><p className="mt-2 font-black">{document.project.project_no}</p><p className="mt-1 leading-5 text-slate-600">{document.project.project_name}</p><p className="mt-1 leading-5 text-slate-500">{projectAddress}</p></div></section>

          <section className="py-7 text-center"><p className="text-xs font-black tracking-[0.14em] text-amber-700">TUNTUTAN UNTUK</p><h1 className="mx-auto mt-2 max-w-3xl text-xl font-black leading-8">{document.invoice.title}</h1>{document.invoice.due_date && <p className="mt-2 text-xs font-bold text-slate-500">Tarikh akhir bayaran: {formatLongDate(document.invoice.due_date)}</p>}</section>

          <table className="quotation-table w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-950 text-white"><th className="w-10 px-3 py-3 text-center">Bil.</th><th className="px-3 py-3">Keterangan tuntutan</th><th className="w-28 px-3 py-3 text-right">Asas</th><th className="w-32 px-3 py-3 text-right">Jumlah (RM)</th></tr></thead><tbody>{document.items.map((item, index) => <tr key={`${item.description}-${index}`} className="border-b border-slate-200 align-top"><td className="px-3 py-3 text-center font-bold text-slate-500">{index + 1}</td><td className="px-3 py-3"><p className="font-black leading-5">{item.description}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{invoiceSourceLabel(item.source_type)}</p></td><td className="px-3 py-3 text-right">{item.percentage ? `${Number(item.percentage).toLocaleString('ms-MY', { maximumFractionDigits: 3 })}%` : 'Jumlah'}</td><td className="px-3 py-3 text-right font-black">{formatNumber(Number(item.amount))}</td></tr>)}</tbody></table>

          <section className="ml-auto mt-5 w-full max-w-md rounded-2xl bg-slate-950 p-5 text-white"><div className="space-y-3 text-sm"><MoneyRow label="Nilai kontrak semasa" value={formatMoney(Number(document.invoice.contract_value))} /><MoneyRow label="Invois sebelum ini" value={formatMoney(Number(document.invoice.previous_billed_amount))} /><div className="border-t border-white/15 pt-3"><MoneyRow label="JUMLAH INVOIS INI" value={formatMoney(Number(document.invoice.total_amount))} tone="text-amber-300 text-xl" /></div><MoneyRow label="Baki kontrak selepas invois" value={formatMoney(Number(document.invoice.contract_balance_after))} /></div></section>

          {hasBankDetails && <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">Maklumat Akaun Bank</p><div className="mt-3 grid grid-cols-3 gap-4 text-xs"><BankInfo label="Bank" value={bankName} /><BankInfo label="Nama pemegang akaun" value={bankAccountName} /><BankInfo label="No. akaun" value={bankAccountNo} mono /></div></section>}

          {document.invoice.notes && <section className="mt-7 text-xs leading-5 text-slate-600"><p className="font-black text-slate-950">Nota</p><p className="mt-1 whitespace-pre-line">{document.invoice.notes}</p></section>}

          <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500"><p>Invois ini ialah tuntutan kewangan bagi projek yang dinyatakan. Bayaran separa akan direkodkan secara berasingan dan setiap bayaran akan menghasilkan resit.</p><p className="mt-1">Dokumen ini tidak memerlukan tandatangan pelanggan atau tandatangan pengguna sistem.</p></footer>
        </div>
      </article>
    </div>
  )
}

function liveDocument(company: Company, project: Project, invoice: Invoice, items: InvoiceItem[]): InvoiceDocumentSnapshot {
  return {
    version: 1,
    invoice: {
      invoice_no: invoice.invoice_no,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      title: invoice.title,
      notes: invoice.notes,
      total_amount: Number(invoice.total_amount),
      contract_value: Number(invoice.contract_value_snapshot ?? project.current_contract_amount),
      previous_billed_amount: Number(invoice.previous_billed_amount_snapshot ?? 0),
      contract_balance_after: Number(invoice.contract_balance_after_snapshot ?? Math.max(0, Number(project.current_contract_amount) - Number(invoice.total_amount))),
      issued_at: invoice.issued_at ?? invoice.updated_at,
    },
    company: {
      legal_name: company.legal_name, trading_name: company.trading_name, registration_no: company.registration_no,
      phone: company.phone, address_line_1: company.address_line_1, address_line_2: company.address_line_2,
      postcode: company.postcode, city: company.city, state: company.state, logo_path: company.logo_path,
      bank_name: company.bank_name, bank_account_name: company.bank_account_name, bank_account_no: company.bank_account_no,
    },
    project: {
      project_no: project.project_no, project_name: project.project_name, client_name: project.client_name,
      client_phone: project.client_phone, address_line_1: project.address_line_1, address_line_2: project.address_line_2,
      postcode: project.postcode, city: project.city, state: project.state,
    },
    items: items.map((item) => ({ source_type: item.source_type as InvoiceDocumentSnapshot['items'][number]['source_type'], variation_order_id: item.variation_order_id, description: item.description, percentage: item.percentage, amount: Number(item.amount) })),
  }
}

function MoneyRow({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-5"><p className="font-bold text-slate-300">{label}</p><p className={`font-black ${tone}`}>{value}</p></div>
}

function BankInfo({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return <div><p className="font-bold text-slate-500">{label}</p><p className={`mt-1 font-black text-slate-950 ${mono ? 'tracking-wider' : ''}`}>{value || '—'}</p></div>
}

function formatNumber(value: number) {
  return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatLongDate(value: string) {
  const date = formatInvoiceDate(value)
  return date === 'Tidak ditetapkan' ? date : date
}
