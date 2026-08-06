import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { projectAddress, type Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import {
  approvalMethodLabel,
  formatSignedMoney,
  variationChangeTypeLabel,
  variationOrderNumber,
  variationOrderStatusLabel,
  type VariationOrder,
  type VariationOrderItem,
  type VariationOrderSection,
} from '../lib/variationOrder'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function VariationOrderPrintPage({ projectId, variationOrderId }: { projectId: string; variationOrderId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [order, setOrder] = useState<VariationOrder | null>(null)
  const [sections, setSections] = useState<VariationOrderSection[]>([])
  const [items, setItems] = useState<VariationOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    const numericOrderId = Number(variationOrderId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0 || !Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setError('ID Projek atau Variation Order tidak sah.')
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
      const [projectResult, orderResult, sectionResult, itemResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('variation_orders').select('*').eq('id', numericOrderId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('variation_order_sections').select('*').eq('variation_order_id', numericOrderId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('sort_order').order('id'),
        client.from('variation_order_items').select('*').eq('variation_order_id', numericOrderId).eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('sort_order').order('id'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? orderResult.error ?? sectionResult.error ?? itemResult.error
      if (loadError || !projectResult.data || !orderResult.data) setError(loadError?.message ?? 'Dokumen Variation Order tidak ditemui.')
      else {
        setCompany(companyRow)
        setProject(projectResult.data)
        setOrder(orderResult.data)
        setSections(sectionResult.data ?? [])
        setItems(itemResult.data ?? [])
      }
      setLoading(false)
    }

    void loadDocument()
    return () => { mounted = false }
  }, [projectId, user, variationOrderId])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan dokumen Variation Order...</div>
  if (error || !company || !project || !order) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Dokumen tidak dapat dibuka.'}</div>

  const brand = (company.trading_name || company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = [company.address_line_1, company.address_line_2, [company.postcode, company.city].filter(Boolean).join(' '), company.state].filter(Boolean).join(', ')
  const originalContract = Number(project.contract_amount)
  const net = Number(order.net_amount)
  const contractAfter = order.status === 'approved' ? Number(project.current_contract_amount) : Number(project.current_contract_amount) + net
  let runningNumber = 0

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(`/projek/${project.id}/vo/${order.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button>
      </div>

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white">
          <div className="flex items-start justify-between gap-6"><div><p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>{company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>{company.phone && <p className="mt-1 text-xs text-slate-300">{company.phone}</p>}</div><div className="text-right"><p className="text-sm font-black tracking-[0.2em] text-amber-300">VARIATION ORDER</p><p className="mt-2 text-lg font-black">{variationOrderNumber(order.vo_no, order.revision_no)}</p><p className="mt-1 text-xs text-slate-300">{formatDate(order.vo_date)}</p><p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-black">{variationOrderStatusLabel(order.status)}</p></div></div>
        </header>

        <div className="px-8 py-7">
          <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-sm"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Pelanggan</p><p className="mt-2 text-lg font-black">{project.client_name}</p><p className="mt-1 text-slate-600">{project.client_phone}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Projek</p><p className="mt-2 font-black">{project.project_no}</p><p className="mt-1 leading-5 text-slate-600">{project.project_name}</p><p className="mt-1 leading-5 text-slate-500">{projectAddress(project)}</p></div></section>

          <section className="py-6"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">{order.title}</p><h1 className="mt-2 text-xl font-black leading-8">Perubahan kepada skop kontrak asal</h1><div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-slate-100 p-4 text-xs"><div className="col-span-2"><p className="font-black text-slate-500">Sebab perubahan</p><p className="mt-1 whitespace-pre-line leading-5 text-slate-800">{order.reason || 'Belum dinyatakan'}</p></div><div className="text-right"><p className="font-black text-slate-500">Kesan masa</p><p className="mt-1 text-lg font-black">{signedDays(order.time_impact_days)}</p></div></div></section>

          {items.length ? <table className="quotation-table w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-950 text-white"><th className="w-10 px-3 py-3 text-center">Bil.</th><th className="px-3 py-3">Keterangan perubahan</th><th className="w-20 px-3 py-3 text-right">Unit</th><th className="w-24 px-3 py-3 text-right">Kadar (RM)</th><th className="w-28 px-3 py-3 text-right">Kesan (RM)</th></tr></thead><tbody>{sections.map((section) => { const sectionItems = items.filter((item) => item.section_id === section.id); if (!sectionItems.length) return null; return [<tr key={`section-${section.id}`} className="bg-amber-100"><td colSpan={5} className="px-3 py-2.5 font-black uppercase tracking-wide text-amber-950">{section.name}</td></tr>, ...sectionItems.map((item) => { runningNumber += 1; return <tr key={item.id} className="border-b border-slate-200 align-top"><td className="px-3 py-3 text-center font-bold text-slate-500">{runningNumber}</td><td className="px-3 py-3"><p className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${item.direction === 'deduct' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{variationChangeTypeLabel(item.change_type)}</p><p className="mt-2 font-black leading-5">{item.item_name}</p><p className="mt-1 leading-5 text-slate-600">{item.description}</p>{item.measurement_text && <p className="mt-1 text-[10px] font-semibold leading-4 text-blue-700">{item.measurement_text}</p>}</td><td className="px-3 py-3 text-right"><p>{Number(item.quantity).toLocaleString('ms-MY', { maximumFractionDigits: 3 })}</p><p className="mt-1 text-[10px] text-slate-400">{item.unit}</p></td><td className="px-3 py-3 text-right">{formatNumber(Number(item.rate))}</td><td className={`px-3 py-3 text-right font-black ${Number(item.signed_amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatSignedNumber(Number(item.signed_amount))}</td></tr> })] })}</tbody></table> : <section className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">VO ini hanya merekod kesan masa dan tidak mengubah nilai kontrak.</section>}

          <section className="ml-auto mt-5 w-full max-w-md rounded-2xl bg-slate-950 p-5 text-white"><div className="space-y-3 text-sm"><MoneyRow label="Nilai kontrak asal" value={formatMoney(originalContract)} /><MoneyRow label="Variation Order ini" value={formatSignedMoney(net)} tone={net < 0 ? 'text-red-300' : 'text-emerald-300'} /><div className="border-t border-white/15 pt-3"><MoneyRow label={order.status === 'approved' ? 'Nilai kontrak semasa' : 'Nilai jika diluluskan'} value={formatMoney(contractAfter)} tone="text-amber-300 text-xl" /></div></div></section>

          {(order.status === 'approved' || order.status === 'rejected') && <section className="mt-7 rounded-2xl border border-slate-200 p-4 text-xs leading-5"><p className="font-black text-slate-950">Rekod keputusan</p><p className="mt-1">Status: <strong>{variationOrderStatusLabel(order.status)}</strong></p><p>Kaedah: <strong>{approvalMethodLabel(order.approval_method)}</strong></p>{order.approval_note && <p className="mt-1 whitespace-pre-line text-slate-600">{order.approval_note}</p>}</section>}

          <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500"><p>Dokumen ini merekod perubahan kepada skop, nilai dan/atau tempoh projek. Skop serta nilai kontrak asal kekal sebagai rekod baseline.</p><p className="mt-1">Persetujuan direkodkan dalam sistem mengikut kaedah komunikasi yang dipilih; tandatangan digital tidak diperlukan pada dokumen ini.</p></footer>
        </div>
      </article>
    </div>
  )
}

function MoneyRow({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-5"><p className="font-bold text-slate-300">{label}</p><p className={`font-black ${tone}`}>{value}</p></div>
}

function formatNumber(value: number) {
  return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSignedNumber(value: number) {
  if (value < 0) return `− ${formatNumber(Math.abs(value))}`
  if (value > 0) return `+ ${formatNumber(value)}`
  return formatNumber(0)
}

function signedDays(value: number) {
  if (value > 0) return `+${value} hari`
  if (value < 0) return `${value} hari`
  return 'Tiada'
}

function formatDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}
