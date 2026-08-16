import { AlertTriangle, CheckCircle2, FilePlus2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { QuotationComposer } from '../components/quotations/QuotationComposer'
import type { CatalogCategory, CatalogItem } from '../lib/catalog'
import {
  buildWhatsAppText,
  createEmptyQuotationDraft,
  quotationDraftFromRows,
  quotationDraftTotal,
  quotationItemQuantity,
  type QuotationSnapshot,
  quotationSnapshotData,
  whatsappNumber,
  type QuotationDraft,
} from '../lib/quotation'
import { clearQuotationDraft, readQuotationDraft, saveQuotationDraft } from '../lib/quotationDrafts'
import { isValidPhone, normalizePhone, type Client, type SiteVisit, type SiteVisitArea, type SiteVisitEntry } from '../lib/siteVisit'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function QuotationEditorPage({ quotationId }: { quotationId?: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [sourceAreas, setSourceAreas] = useState<SiteVisitArea[]>([])
  const [sourceEntries, setSourceEntries] = useState<SiteVisitEntry[]>([])
  const [snapshots, setSnapshots] = useState<QuotationSnapshot[]>([])
  const [draft, setDraft] = useState<QuotationDraft | null>(null)
  const [draftStorageId, setDraftStorageId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [autosaveNotice, setAutosaveNotice] = useState('Draf akan disimpan automatik pada peranti.')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadEditor() {
      setLoading(true)
      setError('')

      const { data: companyRow, error: companyError } = await client
        .from('companies')
        .select('*')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()

      if (!mounted) return
      if (companyError) {
        setError(companyError.message)
        setLoading(false)
        return
      }
      if (!companyRow) {
        setLoading(false)
        return
      }
      setCompany(companyRow)

      const [clientResult, categoryResult, catalogResult] = await Promise.all([
        client.from('clients').select('*').eq('company_id', companyRow.id).order('name').order('id'),
        client.from('company_catalog_categories').select('*').eq('company_id', companyRow.id).eq('is_active', true).order('sort_order').order('id'),
        client.from('company_catalog_items').select('*').eq('company_id', companyRow.id).eq('is_active', true).order('sort_order').order('id'),
      ])
      if (!mounted) return
      const baseError = clientResult.error ?? categoryResult.error ?? catalogResult.error
      if (baseError) {
        setError(baseError.message)
        setLoading(false)
        return
      }

      const loadedClients = clientResult.data ?? []
      setClients(loadedClients)
      setCategories(categoryResult.data ?? [])
      setCatalogItems(catalogResult.data ?? [])

      if (quotationId) {
        const numericId = Number(quotationId)
        if (!Number.isInteger(numericId) || numericId <= 0) {
          setError('ID sebutharga tidak sah.')
          setLoading(false)
          return
        }
        const { data: quoteRow, error: quoteError } = await client
          .from('quotations')
          .select('*')
          .eq('id', numericId)
          .eq('company_id', companyRow.id)
          .maybeSingle()
        if (!mounted) return
        if (quoteError || !quoteRow) {
          setError(quoteError?.message ?? 'Sebutharga tidak ditemui.')
          setLoading(false)
          return
        }
        const [sectionResult, itemResult, snapshotResult] = await Promise.all([
          client.from('quotation_sections').select('*').eq('quotation_id', quoteRow.id).eq('company_id', companyRow.id).order('sort_order').order('id'),
          client.from('quotation_items').select('*').eq('quotation_id', quoteRow.id).eq('company_id', companyRow.id).order('sort_order').order('id'),
          client.from('quotation_snapshots').select('*').eq('quotation_id', quoteRow.id).eq('company_id', companyRow.id).order('revision_no'),
        ])
        if (!mounted) return
        const quoteLoadError = sectionResult.error ?? itemResult.error ?? snapshotResult.error
        if (quoteLoadError) {
          setError(quoteLoadError.message)
          setLoading(false)
          return
        }
        setSnapshots(snapshotResult.data ?? [])

        const storageId = `quote:${quoteRow.id}`
        const databaseDraft = quotationDraftFromRows(quoteRow, sectionResult.data ?? [], itemResult.data ?? [])
        const localDraft = readQuotationDraft(currentUser.id, storageId)
        const useLocal = quoteRow.status === 'draft'
          && localDraft?.quotation_id === quoteRow.id
          && new Date(localDraft.saved_at).getTime() > new Date(quoteRow.updated_at).getTime()
        const loadedDraft = useLocal ? { ...localDraft, status: quoteRow.status, revision_no: quoteRow.revision_no } : databaseDraft
        setDraft(loadedDraft)
        setDraftStorageId(storageId)
        if (useLocal) setNotice('Draf peranti yang lebih baharu telah dipulihkan.')

        if (quoteRow.site_visit_id) {
          await loadSiteVisitSource(client, companyRow.id, quoteRow.site_visit_id, mounted, setSourceAreas, setSourceEntries)
        }
        setLoading(false)
        return
      }

      const sourceVisitId = Number(new URLSearchParams(window.location.search).get('lawatan'))
      const hasSourceVisit = Number.isInteger(sourceVisitId) && sourceVisitId > 0
      const storageId = hasSourceVisit ? `visit:${sourceVisitId}` : 'manual'
      setDraftStorageId(storageId)

      if (hasSourceVisit) {
        const { data: existingQuote, error: existingError } = await client
          .from('quotations')
          .select('id')
          .eq('company_id', companyRow.id)
          .eq('site_visit_id', sourceVisitId)
          .neq('status', 'archived')
          .maybeSingle()
        if (!mounted) return
        if (existingError) {
          setError(existingError.message)
          setLoading(false)
          return
        }
        if (existingQuote) {
          navigate(`/sebutharga/${existingQuote.id}`, { replace: true })
          return
        }

        const [visitResult, areaResult, entryResult] = await Promise.all([
          client.from('site_visits').select('*').eq('id', sourceVisitId).eq('company_id', companyRow.id).maybeSingle(),
          client.from('site_visit_areas').select('*').eq('site_visit_id', sourceVisitId).eq('company_id', companyRow.id).eq('is_active', true).order('sort_order').order('id'),
          client.from('site_visit_entries').select('*').eq('site_visit_id', sourceVisitId).eq('company_id', companyRow.id).eq('is_active', true).order('sort_order').order('id'),
        ])
        if (!mounted) return
        const sourceError = visitResult.error ?? areaResult.error ?? entryResult.error
        if (sourceError || !visitResult.data) {
          setError(sourceError?.message ?? 'Lawatan tapak tidak ditemui.')
          setLoading(false)
          return
        }
        const sourceVisit = visitResult.data
        const sourceClient = loadedClients.find((candidate) => candidate.id === sourceVisit.client_id)
        if (!sourceClient) {
          setError('Pelanggan lawatan tapak tidak ditemui.')
          setLoading(false)
          return
        }
        setSourceAreas(areaResult.data ?? [])
        setSourceEntries(entryResult.data ?? [])
        const localDraft = readQuotationDraft(currentUser.id, storageId)
        setDraft(localDraft ?? draftFromSiteVisit(sourceVisit, sourceClient, areaResult.data ?? []))
        if (localDraft) setNotice('Draf sebutharga daripada lawatan ini telah dipulihkan.')
      } else {
        const localDraft = readQuotationDraft(currentUser.id, storageId)
        setDraft(localDraft ?? createEmptyQuotationDraft())
        if (localDraft) setNotice('Draf sebutharga manual telah dipulihkan.')
      }
      setLoading(false)
    }

    void loadEditor()
    return () => { mounted = false }
  }, [navigate, quotationId, user])

  useEffect(() => {
    if (!draft || !draftStorageId || !user) return
    const saved = saveQuotationDraft(user.id, draftStorageId, draft)
    if (saved) setAutosaveNotice(`Disimpan automatik pada peranti · ${new Date(saved.saved_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`)
  }, [draft, draftStorageId, user])

  useEffect(() => {
    if (!draft || !draftStorageId || !user) return
    const saveBeforeLeaving = () => { saveQuotationDraft(user.id, draftStorageId, draft) }
    window.addEventListener('pagehide', saveBeforeLeaving)
    document.addEventListener('visibilitychange', saveBeforeLeaving)
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeaving)
      document.removeEventListener('visibilitychange', saveBeforeLeaving)
    }
  }, [draft, draftStorageId, user])

  async function saveDatabaseDraft() {
    if (!supabase || !user || !company || !draft) return null
    setError('')
    setNotice('')
    const validationError = validateDraft(draft)
    if (validationError) {
      setError(validationError)
      return null
    }
    setBusy(true)
    try {
      const phoneNormalized = normalizePhone(draft.header.client_phone)
      const payload = {
        ...draft,
        header: { ...draft.header, client_phone_normalized: phoneNormalized },
        sections: draft.sections.map((section, sectionIndex) => ({
          ...section,
          sort_order: (sectionIndex + 1) * 10,
          items: section.items.map((item, itemIndex) => ({
            ...item,
            measurement_text: publicMeasurementText(item.measurement_text, item.source_site_visit_entry_id, sourceEntries),
            quantity: quotationItemQuantity(item),
            rate: Number(item.rate),
            sort_order: (itemIndex + 1) * 10,
          })),
        })),
      }
      const { data: refreshedQuote, error: saveError } = await supabase.rpc('save_quotation_draft', {
        p_quotation_id: draft.quotation_id,
        p_draft: payload,
      })
      if (saveError) throw saveError

      const [savedClientResult, sectionResult, itemResult] = await Promise.all([
        supabase.from('clients').select('*').eq('id', refreshedQuote.client_id).eq('company_id', company.id).single(),
        supabase.from('quotation_sections').select('*').eq('quotation_id', refreshedQuote.id).eq('company_id', company.id).order('sort_order').order('id'),
        supabase.from('quotation_items').select('*').eq('quotation_id', refreshedQuote.id).eq('company_id', company.id).order('sort_order').order('id'),
      ])
      const refreshError = savedClientResult.error ?? sectionResult.error ?? itemResult.error
      if (refreshError) throw refreshError
      const savedClient = savedClientResult.data
      if (!savedClient) throw new Error('Pelanggan yang disimpan tidak ditemui.')
      setClients((current) => [...current.filter((client) => client.id !== savedClient.id), savedClient].sort((a, b) => a.name.localeCompare(b.name, 'ms')))

      const nextDraft = quotationDraftFromRows(refreshedQuote, sectionResult.data ?? [], itemResult.data ?? [])

      const nextStorageId = `quote:${refreshedQuote.id}`
      saveQuotationDraft(user.id, nextStorageId, nextDraft)
      if (draftStorageId !== nextStorageId) clearQuotationDraft(user.id, draftStorageId)
      setDraft(nextDraft)
      setDraftStorageId(nextStorageId)
      setNotice(`Draf ${refreshedQuote.quotation_no} berjaya disimpan.`)
      if (!quotationId) navigate(`/sebutharga/${refreshedQuote.id}`, { replace: true })
      return nextDraft
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Sebutharga tidak dapat disimpan.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function sendQuotation() {
    if (!supabase || !user || !company || !draft) return
    const zeroRate = draft.sections.some((section) => section.items.some((item) => Number(item.rate) === 0))
    if (zeroRate && !window.confirm('Ada item berkadar RM0.00. Terus tandakan sebutharga sebagai dihantar?')) return
    if (!window.confirm('Simpan revision ini dan tandakan sebagai telah dihantar? Selepas itu, perubahan memerlukan revision baharu.')) return
    const saved = await saveDatabaseDraft()
    if (!saved?.quotation_id) return
    setBusy(true)
    setError('')
    try {
      const { data: sentQuote, error: sentError } = await supabase.rpc('send_quotation_revision', {
        p_quotation_id: saved.quotation_id,
        p_revision_no: saved.revision_no,
        p_snapshot_data: quotationSnapshotData(saved),
      })
      if (sentError) throw sentError
      const nextDraft = { ...saved, status: sentQuote.status, saved_at: sentQuote.updated_at }
      setDraft(nextDraft)
      saveQuotationDraft(user.id, `quote:${sentQuote.id}`, nextDraft)
      const { data: snapshotRows, error: snapshotError } = await supabase.from('quotation_snapshots').select('*').eq('quotation_id', sentQuote.id).eq('company_id', company.id).order('revision_no')
      if (snapshotError) throw snapshotError
      setSnapshots(snapshotRows ?? [])
      setNotice('Sebutharga telah ditandakan sebagai dihantar. Revision ini kini dikunci.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Status dihantar tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function startRevision() {
    if (!supabase || !user || !company || !draft?.quotation_id) return
    if (!window.confirm('Mulakan revision baharu? Salinan yang telah dihantar kekal dalam sejarah.')) return
    setBusy(true)
    setError('')
    try {
      const { data, error: revisionError } = await supabase.from('quotations').update({ status: 'draft', revision_no: draft.revision_no + 1, sent_at: null }).eq('id', draft.quotation_id).eq('company_id', company.id).select('*').single()
      if (revisionError) throw revisionError
      const nextDraft = { ...draft, status: data.status, revision_no: data.revision_no, saved_at: data.updated_at }
      setDraft(nextDraft)
      saveQuotationDraft(user.id, `quote:${data.id}`, nextDraft)
      setNotice(`Revision ${data.revision_no} dibuka sebagai draf.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Revision tidak dapat dimulakan.')
    } finally {
      setBusy(false)
    }
  }

  async function acceptQuotation() {
    if (!supabase || !user || !company || !draft?.quotation_id) return
    if (!window.confirm('Tandakan sebutharga ini sebagai diterima? Selepas itu ia tidak boleh diedit atau dipadam.')) return
    setBusy(true)
    setError('')
    try {
      const { data, error: acceptError } = await supabase.from('quotations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', draft.quotation_id).eq('company_id', company.id).select('*').single()
      if (acceptError) throw acceptError
      const nextDraft = { ...draft, status: data.status, saved_at: data.updated_at }
      setDraft(nextDraft)
      saveQuotationDraft(user.id, `quote:${data.id}`, nextDraft)
      setNotice('Sebutharga telah diterima dan dikunci.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Status diterima tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function continueAsProject() {
    if (!supabase || !company || !draft?.quotation_id) return
    if (!window.confirm('Teruskan sebutharga diterima ini sebagai projek? Skop dan nilai kontrak asal akan dikunci sebagai baseline projek.')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: projectError } = await supabase.rpc('create_project_from_accepted_quotation', {
        p_quotation_id: draft.quotation_id,
      })
      if (projectError) throw projectError
      navigate(`/projek/${data.id}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Projek tidak dapat dibina daripada sebutharga ini.')
    } finally {
      setBusy(false)
    }
  }

  function openWhatsApp() {
    if (!draft) return
    const phone = whatsappNumber(draft.header.client_phone)
    if (!phone) {
      setError('No. telefon pelanggan belum lengkap.')
      return
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppText(draft))}`, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan Sebutharga Baru...</div>

  if (!company && !error) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><FilePlus2 className="h-8 w-8 text-amber-700" /><h1 className="mt-4 text-xl font-black">Lengkapkan profil syarikat dahulu</h1><Link href="/profil" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Buka Profil Syarikat</Link></section>

  if (!draft) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><AlertTriangle className="h-7 w-7 text-red-700" /><h1 className="mt-3 text-xl font-black">Sebutharga tidak dapat dibuka</h1>{error && <p className="mt-2 text-sm text-red-700">{error}</p>}<Link href="/sebutharga" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Kembali ke Senarai</Link></section>

  return (
    <>
      {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}
      <QuotationComposer
        key={`${user?.id ?? 'signed-out'}:${draftStorageId}`}
        draft={draft}
        clients={clients}
        categories={categories}
        catalogItems={catalogItems}
        sourceAreas={sourceAreas}
        sourceEntries={sourceEntries}
        snapshots={snapshots}
        draftOwnerUserId={user?.id ?? ''}
        draftStorageId={draftStorageId}
        editable={draft.status === 'draft'}
        busy={busy}
        autosaveNotice={autosaveNotice}
        onChange={setDraft}
        onBack={() => navigate('/sebutharga')}
        onSave={async () => { await saveDatabaseDraft() }}
        onSend={sendQuotation}
        onStartRevision={startRevision}
        onAccept={acceptQuotation}
        onContinueAsProject={continueAsProject}
        onPrint={async () => {
          const printable = draft.status === 'draft' ? await saveDatabaseDraft() : draft
          if (printable?.quotation_id) navigate(`/sebutharga/${printable.quotation_id}/cetak`)
        }}
        onWhatsApp={openWhatsApp}
      />
    </>
  )
}

function draftFromSiteVisit(visit: SiteVisit, client: Client, areas: SiteVisitArea[]): QuotationDraft {
  const draft = createEmptyQuotationDraft()
  return {
    ...draft,
    source_site_visit_id: visit.id,
    header: {
      ...draft.header,
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      client_email: client.email ?? '',
      project_title: visit.project_title.toLocaleUpperCase('ms-MY'),
      address_line_1: visit.address_line_1,
      address_line_2: visit.address_line_2 ?? '',
      postcode: visit.postcode ?? '',
      city: visit.city,
      state: visit.state,
    },
    sections: areas.filter((area) => area.is_active).map((area) => ({
      local_id: `visit-area-${area.id}`,
      id: null,
      source_site_visit_id: visit.id,
      source_site_visit_area_id: area.id,
      name: area.name,
      items: [],
    })),
  }
}

async function loadSiteVisitSource(
  client: NonNullable<typeof supabase>,
  companyId: number,
  visitId: number,
  mounted: boolean,
  setAreas: (areas: SiteVisitArea[]) => void,
  setEntries: (entries: SiteVisitEntry[]) => void,
) {
  const [areaResult, entryResult] = await Promise.all([
    client.from('site_visit_areas').select('*').eq('site_visit_id', visitId).eq('company_id', companyId).eq('is_active', true).order('sort_order').order('id'),
    client.from('site_visit_entries').select('*').eq('site_visit_id', visitId).eq('company_id', companyId).eq('is_active', true).order('sort_order').order('id'),
  ])
  if (!mounted) return
  if (!areaResult.error) setAreas(areaResult.data ?? [])
  if (!entryResult.error) setEntries(entryResult.data ?? [])
}

function validateDraft(draft: QuotationDraft) {
  if (!draft.header.client_name.trim()) return 'Nama pelanggan mesti diisi.'
  if (!isValidPhone(draft.header.client_phone)) return 'No. telefon pelanggan mesti mengandungi 7 hingga 15 digit.'
  if (!draft.header.address_line_1.trim() || !draft.header.city.trim() || !draft.header.state.trim()) return 'Alamat baris 1, bandar dan negeri mesti diisi.'
  if (!draft.header.project_title.trim()) return 'Tajuk sebutharga mesti diisi.'
  const validityDays = Number(draft.header.validity_days)
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) return 'Tempoh sah mesti antara 1 hingga 365 hari.'
  if (draft.quotation_id && !draft.header.quotation_no.trim()) return 'No. sebutharga tidak boleh dikosongkan selepas dijana.'
  for (const section of draft.sections) {
    if (!section.name.trim()) return 'Setiap ruangan mesti mempunyai nama.'
    for (const item of section.items) {
      if (!item.item_name.trim() || !item.description.trim() || !item.unit.trim()) return `Lengkapkan item dalam ruangan ${section.name}.`
      if (item.calculation_method === 'area' && !item.id && (!Number(item.length_value) || !Number(item.width_value))) return `Masukkan panjang dan lebar untuk item ${item.item_name}.`
      if (item.calculation_method === 'length' && !item.id && !Number(item.length_value)) return `Masukkan panjang untuk item ${item.item_name}.`
      if (!(quotationItemQuantity(item) ?? 0) || !(Number(item.rate) >= 0)) return `Semak kuantiti dan kadar item ${item.item_name}.`
    }
  }
  if (quotationDraftTotal(draft) > 99_999_999_999.99) return 'Jumlah sebutharga melebihi had sistem.'
  return ''
}

function publicMeasurementText(value: string, sourceEntryId: number | null, entries: SiteVisitEntry[]) {
  if (!sourceEntryId) return value.trim()
  const internalNote = entries.find((entry) => entry.id === sourceEntryId)?.note_text.trim()
  if (!internalNote) return value.trim()
  const trimmed = value.trim()
  if (trimmed === internalNote) return ''
  if (trimmed.startsWith(`${internalNote} · `)) return trimmed.slice(internalNote.length + 3).trim()
  return trimmed
}
