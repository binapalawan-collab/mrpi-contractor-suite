import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { companyAssetBucket } from '../lib/companyAssets'
import { formatInvoiceDate, parseInvoiceSnapshot, paymentMethodLabel, type Invoice, type InvoiceDocumentSnapshot, type InvoicePayment } from '../lib/invoice'
import type { Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row'] & { receipt_show_signature_stamp?: boolean }
type ReceiptAssets = { signature: string | null; stamp: string | null }
const emptyReceiptAssets: ReceiptAssets = { signature: null, stamp: null }

export function ReceiptPrintPage({ projectId, invoiceId, paymentId }: { projectId: string; invoiceId: string; paymentId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [payment, setPayment] = useState<InvoicePayment | null>(null)
  const [snapshot, setSnapshot] = useState<InvoiceDocumentSnapshot | null>(null)
  const [receiptAssets, setReceiptAssets] = useState<ReceiptAssets>(emptyReceiptAssets)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    const numericInvoiceId = Number(invoiceId)
    const numericPaymentId = Number(paymentId)
    if (![numericProjectId, numericInvoiceId, numericPaymentId].every((value) => Number.isInteger(value) && value > 0)) {
      setError('ID resit tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadReceipt() {
      const { data: companyRow, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !companyRow) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const receiptCompany = companyRow as Company
      const [projectResult, invoiceResult, paymentResult, snapshotResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', receiptCompany.id).maybeSingle(),
        client.from('invoices').select('*').eq('id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', receiptCompany.id).maybeSingle(),
        client.from('invoice_payments').select('*').eq('id', numericPaymentId).eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', receiptCompany.id).maybeSingle(),
        client.from('invoice_snapshots').select('snapshot_data').eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', receiptCompany.id).maybeSingle(),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? invoiceResult.error ?? paymentResult.error ?? snapshotResult.error
      const parsed = snapshotResult.data ? parseInvoiceSnapshot(snapshotResult.data.snapshot_data) : null
      if (loadError || !projectResult.data || !invoiceResult.data || !paymentResult.data || !parsed) {
        setError(loadError?.message ?? 'Rekod resit atau snapshot invois tidak ditemui.')
      } else {
        setCompany(receiptCompany)
        setProject(projectResult.data)
        setInvoice(invoiceResult.data)
        setPayment(paymentResult.data)
        setSnapshot(parsed)

        if (receiptCompany.receipt_show_signature_stamp && receiptCompany.signature_path && receiptCompany.stamp_path) {
          const requestedPaths = [receiptCompany.signature_path, receiptCompany.stamp_path]
          const { data: signedAssets, error: assetError } = await client.storage
            .from(companyAssetBucket)
            .createSignedUrls(requestedPaths, 60 * 60 * 6)
          if (!assetError && mounted) {
            const urlByPath = new Map((signedAssets ?? []).map((item) => [item.path, item.signedUrl]))
            setReceiptAssets({
              signature: urlByPath.get(receiptCompany.signature_path) ?? null,
              stamp: urlByPath.get(receiptCompany.stamp_path) ?? null,
            })
          }
        } else {
          setReceiptAssets(emptyReceiptAssets)
        }
      }
      setLoading(false)
    }

    void loadReceipt()
    return () => { mounted = false }
  }, [invoiceId, paymentId, projectId, user])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan resit...</div>
  if (error || !company || !project || !invoice || !payment || !snapshot) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Resit tidak dapat dibuka.'}</div>

  const brand = (snapshot.company.trading_name || snapshot.company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = [snapshot.company.address_line_1, snapshot.company.address_line_2, [snapshot.company.postcode, snapshot.company.city].filter(Boolean).join(' '), snapshot.company.state].filter(Boolean).join(', ')
  const showApproval = Boolean(company.receipt_show_signature_stamp && receiptAssets.signature && receiptAssets.stamp)

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => navigate(`/projek/${project.id}/invois/${invoice.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button><button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button></div>

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-emerald-500 bg-slate-950 px-8 py-7 text-white"><div className="flex items-start justify-between gap-6"><div><p className="text-2xl font-black tracking-tight text-emerald-300">{brand}</p>{snapshot.company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{snapshot.company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>{snapshot.company.phone && <p className="mt-1 text-xs text-slate-300">{snapshot.company.phone}</p>}</div><div className="text-right"><p className="text-sm font-black tracking-[0.2em] text-emerald-300">RESIT RASMI</p><p className="mt-2 text-lg font-black">{payment.receipt_no}</p><p className="mt-1 text-xs text-slate-300">{formatInvoiceDate(payment.payment_date)}</p></div></div></header>

        <div className="px-8 py-8">
          <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-sm"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Diterima daripada</p><p className="mt-2 text-lg font-black">{snapshot.project.client_name}</p><p className="mt-1 text-slate-600">{snapshot.project.client_phone}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Untuk projek</p><p className="mt-2 font-black">{snapshot.project.project_no}</p><p className="mt-1 leading-5 text-slate-600">{snapshot.project.project_name}</p></div></section>

          <section className="my-8 rounded-3xl bg-emerald-50 p-7 text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Jumlah diterima</p><p className="mt-3 text-4xl font-black text-emerald-800">{formatMoney(Number(payment.amount))}</p><p className="mt-3 text-sm font-semibold text-slate-600">Bayaran untuk invois <strong className="text-slate-950">{invoice.invoice_no}</strong></p></section>

          <section className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-2xl border border-slate-200 p-5 text-sm"><ReceiptRow label="Tarikh bayaran" value={formatInvoiceDate(payment.payment_date)} /><ReceiptRow label="Kaedah" value={paymentMethodLabel(payment.payment_method)} />{payment.reference_no && <ReceiptRow label="No. rujukan" value={payment.reference_no} />}<ReceiptRow label="Jumlah invois" value={formatMoney(Number(payment.invoice_total_snapshot))} /><ReceiptRow label="Dibayar sebelum ini" value={formatMoney(Number(payment.paid_before_snapshot))} /><ReceiptRow label="Jumlah terkumpul" value={formatMoney(Number(payment.paid_after_snapshot))} /><div className="col-span-2 border-t border-slate-200 pt-4"><div className="flex items-center justify-between gap-4"><p className="font-black text-slate-500">BAKI SELEPAS BAYARAN</p><p className="text-xl font-black">{formatMoney(Number(payment.balance_after_snapshot))}</p></div></div></section>

          {payment.notes && <section className="mt-6 text-xs leading-5 text-slate-600"><p className="font-black text-slate-950">Nota</p><p className="mt-1 whitespace-pre-line">{payment.notes}</p></section>}

          {showApproval && <section aria-label="Pengesahan syarikat" className="mt-8 flex justify-end">
            <div className="w-[290px] text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Disahkan oleh</p>
              <div className="mt-2 flex min-h-28 items-end justify-center gap-2">
                <img src={receiptAssets.signature!} alt="Tandatangan syarikat" className="max-h-[76px] w-[160px] object-contain" />
                <img src={receiptAssets.stamp!} alt="Cop syarikat" className="h-[104px] w-[104px] object-contain" />
              </div>
              <p className="mt-2 text-xs font-black text-slate-950">{company.owner_name}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{brand}</p>
            </div>
          </section>}
        </div>
      </article>
    </div>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>
}
