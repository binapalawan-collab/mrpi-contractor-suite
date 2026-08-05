import { CalendarDays, CheckCircle2, FilePlus2, Files, Search, Send, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { formatMoney, formatQuotationNumber, quotationStatusLabel, type Quotation } from '../lib/quotation'
import { supabase } from '../lib/supabase'

type StatusFilter = 'all' | 'draft' | 'sent' | 'accepted'

export function QuotationListPage() {
  const { user } = useAuth()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true
    async function loadQuotations() {
      setLoading(true)
      const { data: company, error: companyError } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? '')
        setLoading(false)
        return
      }
      setCompanyId(company.id)
      const { data, error: quotationError } = await client.from('quotations').select('*').eq('company_id', company.id).neq('status', 'archived').order('quotation_date', { ascending: false }).order('id', { ascending: false })
      if (!mounted) return
      if (quotationError) setError(quotationError.message)
      else setQuotations(data ?? [])
      setLoading(false)
    }
    void loadQuotations()
    return () => { mounted = false }
  }, [user])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ms-MY')
    return quotations.filter((quotation) => {
      if (statusFilter !== 'all' && quotation.status !== statusFilter) return false
      if (!query) return true
      return [quotation.quotation_no, quotation.client_name, quotation.client_phone, quotation.project_title, quotation.city]
        .some((value) => value.toLocaleLowerCase('ms-MY').includes(query))
    })
  }, [quotations, search, statusFilter])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan senarai sebutharga...</div>
  if (!companyId && !error) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-black">Lengkapkan profil dahulu</h1><Link href="/profil" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Buka Profil Syarikat</Link></section>

  const draftCount = quotations.filter((quotation) => quotation.status === 'draft').length
  const sentCount = quotations.filter((quotation) => quotation.status === 'sent').length
  const acceptedCount = quotations.filter((quotation) => quotation.status === 'accepted').length

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-bold text-amber-700">Draf, revision dan penerimaan</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Senarai Sebutharga</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Semua quote kekal di bawah syarikat ini. Sebutharga diterima dikunci dan tidak boleh diedit atau dipadam.</p></div>
        <Link href="/sebutharga/baru" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 shadow-lg shadow-amber-200/60"><FilePlus2 className="h-5 w-5" />Sebutharga Baharu</Link>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Ringkasan sebutharga">
        <Summary icon={<Files />} value={draftCount} label="Draf" tone="bg-amber-100 text-amber-800" />
        <Summary icon={<Send />} value={sentCount} label="Dihantar" tone="bg-blue-100 text-blue-800" />
        <Summary icon={<CheckCircle2 />} value={acceptedCount} label="Diterima" tone="bg-emerald-100 text-emerald-800" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder="Cari no. quote, pelanggan atau projek" /></div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([['all', 'Semua'], ['draft', 'Draf'], ['sent', 'Dihantar'], ['accepted', 'Diterima']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ${statusFilter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
        </div>
      </section>

      {visible.length ? (
        <section className="grid gap-3 md:grid-cols-2">
          {visible.map((quotation) => {
            const tone = quotation.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : quotation.status === 'sent' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
            return <Link key={quotation.id} href={`/sebutharga/${quotation.id}`} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tone}`}>{quotationStatusLabel(quotation.status)}</span><p className="mt-3 text-lg font-black tracking-tight">{formatQuotationNumber(quotation.quotation_no, quotation.revision_no)}</p></div><div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-800"><WalletCards className="h-5 w-5" /></div></div>
              <p className="mt-3 font-black text-slate-950">{quotation.client_name}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{quotation.project_title}</p>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><CalendarDays className="h-4 w-4" />{formatDate(quotation.quotation_date)}</p><p className="text-lg font-black">{formatMoney(Number(quotation.total_amount))}</p></div>
            </Link>
          })}
        </section>
      ) : (
        <section className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Files className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 font-black">Tiada sebutharga ditemui</h2><p className="mt-2 text-sm text-slate-500">Mulakan quote baharu atau ubah carian dan penapis.</p></section>
      )}
    </div>
  )
}

function Summary({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"><div className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5 ${tone}`}>{icon}</div><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p></article>
}

function formatDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}
