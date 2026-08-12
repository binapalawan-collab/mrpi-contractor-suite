import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { QuotationFormattedText } from '../components/quotations/QuotationFormattedText'
import { formatMoney, formatQuotationNumber, quotationStoredItemsTotal, type Quotation, type QuotationItem, type QuotationSection } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function QuotationPrintPage({ quotationId }: { quotationId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [sections, setSections] = useState<QuotationSection[]>([])
  const [items, setItems] = useState<QuotationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true
    async function loadPrintData() {
      const id = Number(quotationId)
      if (!Number.isInteger(id) || id <= 0) {
        setError('ID sebutharga tidak sah.')
        setLoading(false)
        return
      }
      const { data: companyRow, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !companyRow) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [quoteResult, sectionResult, itemResult] = await Promise.all([
        client.from('quotations').select('*').eq('id', id).eq('company_id', companyRow.id).maybeSingle(),
        client.from('quotation_sections').select('*').eq('quotation_id', id).eq('company_id', companyRow.id).order('sort_order').order('id'),
        client.from('quotation_items').select('*').eq('quotation_id', id).eq('company_id', companyRow.id).order('sort_order').order('id'),
      ])
      if (!mounted) return
      const firstError = quoteResult.error ?? sectionResult.error ?? itemResult.error
      if (firstError || !quoteResult.data) setError(firstError?.message ?? 'Sebutharga tidak ditemui.')
      else {
        setCompany(companyRow)
        setQuotation(quoteResult.data)
        setSections(sectionResult.data ?? [])
        setItems(itemResult.data ?? [])
      }
      setLoading(false)
    }
    void loadPrintData()
    return () => { mounted = false }
  }, [quotationId, user])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan dokumen sebutharga...</div>
  if (error || !company || !quotation) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Dokumen tidak dapat dibuka.'}</div>

  const english = quotation.language === 'en'
  const brand = (company.trading_name || company.legal_name).toLocaleUpperCase('en-MY')
  const address = [quotation.address_line_1, quotation.address_line_2, quotation.postcode, quotation.city, quotation.state].filter(Boolean).join(', ')
  const companyAddress = [company.address_line_1, company.address_line_2, company.postcode, company.city, company.state].filter(Boolean).join(', ')
  let runningNumber = 0

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(`/sebutharga/${quotation.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button>
      </div>

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>
              {company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{company.registration_no}</p>}
              <p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>
              {company.phone && <p className="mt-1 text-xs text-slate-300">{company.phone}</p>}
            </div>
            <div className="text-right"><p className="text-sm font-black tracking-[0.2em] text-amber-300">{english ? 'QUOTATION' : 'SEBUTHARGA'}</p><p className="mt-2 text-lg font-black">{formatQuotationNumber(quotation.quotation_no, quotation.revision_no)}</p><p className="mt-1 text-xs text-slate-300">{formatDate(quotation.quotation_date, english ? 'en-MY' : 'ms-MY')}</p></div>
          </div>
        </header>

        <div className="px-8 py-7">
          <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-sm">
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{english ? 'Prepared for' : 'Disediakan untuk'}</p><p className="mt-2 text-lg font-black">{quotation.client_name}</p><p className="mt-1 text-slate-600">{quotation.client_phone}</p>{quotation.client_email && <p className="mt-1 text-slate-600">{quotation.client_email}</p>}</div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{english ? 'Project address' : 'Alamat projek'}</p><p className="mt-2 leading-6 text-slate-700">{address}</p></div>
          </section>

          <section className="py-7 text-center"><p className="text-xs font-black tracking-[0.14em] text-amber-700">{english ? 'QUOTATION FOR' : 'SEBUTHARGA UNTUK'}</p><h1 className="mx-auto mt-2 max-w-3xl text-xl font-black leading-8">{quotation.project_title}</h1><p className="mt-2 text-xs font-bold text-slate-400">{english ? `BY ${brand}` : `OLEH ${brand}`}</p></section>

          <table className="quotation-table w-full table-fixed border-collapse text-left text-xs">
            <thead><tr className="bg-slate-950 text-white"><th className="w-10 px-3 py-3 text-center">{english ? 'No.' : 'Bil.'}</th><th className="px-3 py-3">{english ? 'Description' : 'Keterangan'}</th><th className="w-20 px-3 py-3 text-right">{english ? 'Unit' : 'Unit'}</th><th className="w-24 px-3 py-3 text-right">{english ? 'Rate (RM)' : 'Kadar (RM)'}</th><th className="w-28 px-3 py-3 text-right">{english ? 'Amount (RM)' : 'Jumlah (RM)'}</th></tr></thead>
            <tbody>
              {sections.map((section) => {
                const sectionItems = items.filter((item) => item.section_id === section.id)
                const sectionTotal = quotationStoredItemsTotal(sectionItems)
                return [
                  <tr key={`section-${section.id}`} className="bg-amber-100"><td colSpan={5} className="px-3 py-2.5 font-black uppercase tracking-wide text-amber-950">{section.name}</td></tr>,
                  ...sectionItems.map((item) => {
                    runningNumber += 1
                    return <tr key={item.id} className="border-b border-slate-200 align-top"><td className="px-3 py-3 text-center font-bold text-slate-500">{runningNumber}</td><td className="min-w-0 px-3 py-3"><QuotationFormattedText text={item.item_name} className="font-black leading-5" /><QuotationFormattedText text={item.description} className="mt-1 leading-5 text-slate-600" />{item.measurement_text && <QuotationFormattedText text={item.measurement_text} className="mt-1 text-[10px] font-semibold leading-4 text-blue-700" />}</td><td className="px-3 py-3 text-right"><p>{Number(item.quantity).toLocaleString(english ? 'en-MY' : 'ms-MY', { maximumFractionDigits: 3 })}</p><p className="mt-1 break-words text-[10px] text-slate-400">{item.unit}</p></td><td className="px-3 py-3 text-right">{formatNumber(Number(item.rate))}</td><td className="px-3 py-3 text-right font-black">{formatNumber(Number(item.amount ?? Number(item.quantity) * Number(item.rate)))}</td></tr>
                  }),
                  <tr key={`section-total-${section.id}`} className="border-y-2 border-amber-300 bg-amber-50"><td colSpan={4} className="px-3 py-3 text-right font-black uppercase tracking-wide text-amber-950">{english ? `Subtotal · ${section.name}` : `Jumlah ${section.name}`}</td><td className="px-3 py-3 text-right text-sm font-black text-amber-950">{formatNumber(sectionTotal)}</td></tr>,
                ]
              })}
            </tbody>
          </table>

          <section className="ml-auto mt-5 w-full max-w-sm rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><p className="text-sm font-bold text-slate-300">{english ? 'TOTAL' : 'JUMLAH KESELURUHAN'}</p><p className="text-2xl font-black text-amber-300">{formatMoney(Number(quotation.total_amount))}</p></div></section>

          <section className="mt-7 text-xs leading-5 text-slate-600">
            <p className="font-black text-slate-950">{english ? 'Terms' : 'Terma'}</p><p className="mt-1">{english ? `This quotation is valid for ${quotation.validity_days} days from the quotation date.` : `Sebutharga ini sah selama ${quotation.validity_days} hari dari tarikh sebutharga.`}</p>{quotation.notes && <p className="mt-2 whitespace-pre-line">{quotation.notes}</p>}
          </section>

        </div>
      </article>
    </div>
  )
}

function formatNumber(value: number) {
  return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(value: string, locale: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}
