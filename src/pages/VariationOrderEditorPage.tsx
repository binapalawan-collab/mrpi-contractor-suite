import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clock3,
  FileDown,
  History,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { VariationOrderItemDialog } from '../components/variation-orders/VariationOrderItemDialog'
import type { CatalogCategory, CatalogItem } from '../lib/catalog'
import type { Project, ProjectItem, ProjectSection } from '../lib/project'
import { formatMoney, localId, whatsappNumber } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import {
  approvalMethodLabel,
  buildVariationOrderWhatsAppText,
  formatSignedMoney,
  variationChangeTypeLabel,
  variationOrderDraftFromRows,
  variationOrderDraftTotal,
  variationOrderItemAmount,
  variationOrderNumber,
  variationOrderStatusLabel,
  variationOrderStatusTone,
  type ApprovalMethod,
  type VariationOrder,
  type VariationOrderDraft,
  type VariationOrderDraftItem,
  type VariationOrderDraftSection,
} from '../lib/variationOrder'
import {
  clearVariationOrderDraft,
  clearVariationOrderItemDraft,
  readVariationOrderDraft,
  readVariationOrderItemDraft,
  saveVariationOrderDraft,
  saveVariationOrderItemDraft,
  type StoredVariationOrderItemEditorDraft,
  type VariationOrderItemEditorDraft,
} from '../lib/variationOrderDrafts'

type ItemDialogState = {
  sectionLocalId: string
  item: VariationOrderDraftItem | null
  initialDraft: StoredVariationOrderItemEditorDraft | null
}

export function VariationOrderEditorPage({ projectId, variationOrderId }: { projectId: string; variationOrderId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [projectSections, setProjectSections] = useState<ProjectSection[]>([])
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [order, setOrder] = useState<VariationOrder | null>(null)
  const [draft, setDraft] = useState<VariationOrderDraft | null>(null)
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [approvalMethod, setApprovalMethod] = useState<ApprovalMethod>('whatsapp')
  const [approvalNote, setApprovalNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [autosaveNotice, setAutosaveNotice] = useState('Draf akan disimpan automatik pada peranti.')

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

    async function loadEditor() {
      setLoading(true)
      setError('')
      const { data: company, error: companyError } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      setCompanyId(company.id)

      const [projectResult, orderResult, orderSectionResult, orderItemResult, projectSectionResult, projectItemResult, categoryResult, catalogResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('variation_orders').select('*').eq('id', numericOrderId).eq('project_id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('variation_order_sections').select('*').eq('variation_order_id', numericOrderId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('variation_order_items').select('*').eq('variation_order_id', numericOrderId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('project_sections').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('project_items').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('company_catalog_categories').select('*').eq('company_id', company.id).eq('is_active', true).order('sort_order').order('id'),
        client.from('company_catalog_items').select('*').eq('company_id', company.id).eq('is_active', true).order('sort_order').order('id'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? orderResult.error ?? orderSectionResult.error ?? orderItemResult.error ?? projectSectionResult.error ?? projectItemResult.error ?? categoryResult.error ?? catalogResult.error
      if (loadError || !projectResult.data || !orderResult.data) {
        setError(loadError?.message ?? 'Variation Order tidak ditemui di dalam projek ini.')
        setLoading(false)
        return
      }

      const databaseDraft = variationOrderDraftFromRows(orderResult.data, orderSectionResult.data ?? [], orderItemResult.data ?? [])
      const localDraft = orderResult.data.status === 'draft' ? readVariationOrderDraft(currentUser.id, numericOrderId) : null
      const localIsNewer = localDraft && new Date(localDraft.saved_at).getTime() > new Date(orderResult.data.updated_at).getTime()
      const selectedDraft = localIsNewer ? localDraft : databaseDraft

      setProject(projectResult.data)
      setOrder(orderResult.data)
      setProjectSections(projectSectionResult.data ?? [])
      setProjectItems(projectItemResult.data ?? [])
      setCategories(categoryResult.data ?? [])
      setCatalogItems(catalogResult.data ?? [])
      setDraft(selectedDraft)
      setApprovalMethod((orderResult.data.approval_method as ApprovalMethod | null) ?? 'whatsapp')
      setApprovalNote(orderResult.data.approval_note ?? '')

      if (localIsNewer) setNotice('Draf terakhir pada peranti telah dipulihkan selepas kau meninggalkan aplikasi.')
      if (orderResult.data.status === 'draft') {
        const storedItem = readVariationOrderItemDraft(currentUser.id, numericOrderId)
        if (storedItem && selectedDraft.sections.some((section) => section.local_id === storedItem.section_local_id)) {
          setItemDialog({ sectionLocalId: storedItem.section_local_id, item: storedItem.item, initialDraft: storedItem })
        } else if (storedItem) clearVariationOrderItemDraft(currentUser.id, numericOrderId)
      } else {
        clearVariationOrderDraft(currentUser.id, numericOrderId)
      }
      setLoading(false)
    }

    void loadEditor()
    return () => { mounted = false }
  }, [projectId, user, variationOrderId])

  useEffect(() => {
    if (!draft || !user || draft.status !== 'draft') return
    const saved = saveVariationOrderDraft(user.id, draft.variation_order_id, draft)
    if (saved) setAutosaveNotice(`Disimpan automatik pada peranti · ${new Date(saved.saved_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`)
  }, [draft, user])

  useEffect(() => {
    if (!draft || !user || draft.status !== 'draft') return
    const saveBeforeLeaving = () => { saveVariationOrderDraft(user.id, draft.variation_order_id, draft) }
    window.addEventListener('pagehide', saveBeforeLeaving)
    document.addEventListener('visibilitychange', saveBeforeLeaving)
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeaving)
      document.removeEventListener('visibilitychange', saveBeforeLeaving)
    }
  }, [draft, user])

  const editable = order?.status === 'draft'
  const total = useMemo(() => draft ? variationOrderDraftTotal(draft) : 0, [draft])
  const itemCount = useMemo(() => draft?.sections.reduce((count, section) => count + section.items.length, 0) ?? 0, [draft])
  const usedSourceSectionIds = useMemo(() => new Set(draft?.sections.flatMap((section) => section.source_project_section_id ? [section.source_project_section_id] : []) ?? []), [draft])

  function updateDraft(patch: Partial<VariationOrderDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  function updateSections(sections: VariationOrderDraftSection[]) {
    updateDraft({ sections })
  }

  function addSection(name: string, sourceProjectSectionId: number | null = null) {
    if (!draft || !editable) return
    const trimmed = name.trim()
    if (!trimmed) return
    updateSections([...draft.sections, { local_id: localId(), id: null, source_project_section_id: sourceProjectSectionId, name: trimmed, items: [] }])
    setNewSectionName('')
  }

  function renameSection(section: VariationOrderDraftSection) {
    if (!draft || !editable) return
    const name = window.prompt('Nama kawasan kerja', section.name)?.trim()
    if (!name) return
    updateSections(draft.sections.map((candidate) => candidate.local_id === section.local_id ? { ...candidate, name } : candidate))
  }

  function removeSection(section: VariationOrderDraftSection) {
    if (!draft || !editable || !window.confirm(`Buang kawasan “${section.name}” dan semua item di dalamnya?`)) return
    if (itemDialog?.sectionLocalId === section.local_id) setItemDialog(null)
    updateSections(draft.sections.filter((candidate) => candidate.local_id !== section.local_id))
  }

  function moveSection(index: number, direction: -1 | 1) {
    if (!draft || !editable) return
    const target = index + direction
    if (target < 0 || target >= draft.sections.length) return
    const next = [...draft.sections]
    const currentSection = next[index]
    const targetSection = next[target]
    if (!currentSection || !targetSection) return
    next[index] = targetSection
    next[target] = currentSection
    updateSections(next)
  }

  function openItemDialog(sectionLocalId: string, item: VariationOrderDraftItem | null) {
    if (!user || !draft || !editable) return
    clearVariationOrderItemDraft(user.id, draft.variation_order_id)
    setItemDialog({ sectionLocalId, item, initialDraft: null })
  }

  function closeItemDialog() {
    if (user && draft) clearVariationOrderItemDraft(user.id, draft.variation_order_id)
    setItemDialog(null)
  }

  const persistItemComposer = useCallback((composer: Pick<VariationOrderItemEditorDraft, 'item' | 'mode' | 'search' | 'category_id'>) => {
    if (!user || !draft || !itemDialog) return
    saveVariationOrderItemDraft(user.id, draft.variation_order_id, { ...composer, section_local_id: itemDialog.sectionLocalId })
  }, [draft, itemDialog, user])

  function saveItem(item: VariationOrderDraftItem) {
    if (!draft || !itemDialog) return
    updateSections(draft.sections.map((section) => {
      if (section.local_id !== itemDialog.sectionLocalId) return section
      const exists = section.items.some((candidate) => candidate.local_id === item.local_id)
      return { ...section, items: exists ? section.items.map((candidate) => candidate.local_id === item.local_id ? item : candidate) : [...section.items, item] }
    }))
    closeItemDialog()
  }

  function removeItem(sectionLocalId: string, item: VariationOrderDraftItem) {
    if (!draft || !editable || !window.confirm(`Buang perubahan “${item.item_name}”?`)) return
    updateSections(draft.sections.map((section) => section.local_id === sectionLocalId ? { ...section, items: section.items.filter((candidate) => candidate.local_id !== item.local_id) } : section))
  }

  function moveItem(sectionLocalId: string, index: number, direction: -1 | 1) {
    if (!draft || !editable) return
    updateSections(draft.sections.map((section) => {
      if (section.local_id !== sectionLocalId) return section
      const target = index + direction
      if (target < 0 || target >= section.items.length) return section
      const nextItems = [...section.items]
      const currentItem = nextItems[index]
      const targetItem = nextItems[target]
      if (!currentItem || !targetItem) return section
      nextItems[index] = targetItem
      nextItems[target] = currentItem
      return { ...section, items: nextItems }
    }))
  }

  function validateDraft(send = false) {
    if (!draft) return 'Draf belum tersedia.'
    if (!draft.title.trim()) return 'Tajuk Variation Order mesti diisi.'
    const timeImpact = Number(draft.time_impact_days)
    if (!Number.isInteger(timeImpact) || timeImpact < -3650 || timeImpact > 3650) return 'Kesan masa mesti nombor hari bulat antara -3650 hingga 3650.'
    for (const section of draft.sections) {
      if (!section.name.trim()) return 'Setiap kawasan kerja mesti mempunyai nama.'
      for (const item of section.items) {
        if (!item.item_name.trim() || !item.description.trim() || !item.unit.trim()) return 'Setiap item mesti mempunyai nama, keterangan dan unit.'
        if (Number(item.quantity) <= 0 || !Number.isFinite(Number(item.quantity))) return `Kuantiti “${item.item_name}” tidak sah.`
        if (Number(item.rate) < 0 || !Number.isFinite(Number(item.rate))) return `Kadar “${item.item_name}” tidak sah.`
      }
    }
    if (send && !draft.reason.trim()) return 'Sebab perubahan mesti diisi sebelum dihantar.'
    if (send && itemCount === 0 && timeImpact === 0) return 'Masukkan sekurang-kurangnya satu item atau kesan masa.'
    return ''
  }

  async function persistDatabaseDraft() {
    if (!supabase || !user || !companyId || !project || !order || !draft) return null
    const validationError = validateDraft(false)
    if (validationError) throw new Error(validationError)

    const { data: savedOrder, error: orderError } = await supabase.from('variation_orders').update({
      vo_date: draft.vo_date,
      title: draft.title.trim(),
      reason: draft.reason.trim(),
      time_impact_days: Number(draft.time_impact_days),
    }).eq('id', order.id).eq('project_id', project.id).eq('company_id', companyId).select('*').single()
    if (orderError) throw orderError

    const [existingSectionResult, existingItemResult] = await Promise.all([
      supabase.from('variation_order_sections').select('id').eq('variation_order_id', order.id).eq('company_id', companyId),
      supabase.from('variation_order_items').select('id').eq('variation_order_id', order.id).eq('company_id', companyId),
    ])
    const existingError = existingSectionResult.error ?? existingItemResult.error
    if (existingError) throw existingError

    const savedSections: VariationOrderDraftSection[] = []
    for (const [sectionIndex, section] of draft.sections.entries()) {
      const sectionValues = { source_project_section_id: section.source_project_section_id, name: section.name.trim(), sort_order: (sectionIndex + 1) * 10 }
      let savedSection
      if (section.id) {
        const result = await supabase.from('variation_order_sections').update(sectionValues).eq('id', section.id).eq('variation_order_id', order.id).eq('company_id', companyId).select('*').single()
        if (result.error) throw result.error
        savedSection = result.data
      } else {
        const result = await supabase.from('variation_order_sections').insert({ ...sectionValues, variation_order_id: order.id, project_id: project.id, company_id: companyId, owner_user_id: user.id }).select('*').single()
        if (result.error) throw result.error
        savedSection = result.data
      }

      const savedItems: VariationOrderDraftItem[] = []
      for (const [itemIndex, item] of section.items.entries()) {
        const itemValues = {
          catalog_item_id: item.catalog_item_id,
          source_project_item_id: item.source_project_item_id,
          change_type: item.change_type,
          direction: item.direction,
          item_name: item.item_name.trim(),
          description: item.description.trim(),
          measurement_text: item.measurement_text.trim() || null,
          calculation_method: item.calculation_method,
          unit: item.unit.trim(),
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          sort_order: (itemIndex + 1) * 10,
        }
        let savedItem
        if (item.id) {
          const result = await supabase.from('variation_order_items').update(itemValues).eq('id', item.id).eq('variation_order_id', order.id).eq('company_id', companyId).select('*').single()
          if (result.error) throw result.error
          savedItem = result.data
        } else {
          const result = await supabase.from('variation_order_items').insert({ ...itemValues, variation_order_id: order.id, section_id: savedSection.id, project_id: project.id, company_id: companyId, owner_user_id: user.id }).select('*').single()
          if (result.error) throw result.error
          savedItem = result.data
        }
        savedItems.push({ ...item, id: savedItem.id, quantity: String(savedItem.quantity), rate: Number(savedItem.rate).toFixed(2) })
      }
      savedSections.push({ ...section, id: savedSection.id, name: savedSection.name, source_project_section_id: savedSection.source_project_section_id, items: savedItems })
    }

    const retainedItemIds = new Set(savedSections.flatMap((section) => section.items.flatMap((item) => item.id ? [item.id] : [])))
    const itemIdsToDelete = (existingItemResult.data ?? []).map((row) => row.id).filter((id) => !retainedItemIds.has(id))
    if (itemIdsToDelete.length) {
      const result = await supabase.from('variation_order_items').delete().in('id', itemIdsToDelete).eq('variation_order_id', order.id).eq('company_id', companyId)
      if (result.error) throw result.error
    }

    const retainedSectionIds = new Set(savedSections.flatMap((section) => section.id ? [section.id] : []))
    const sectionIdsToDelete = (existingSectionResult.data ?? []).map((row) => row.id).filter((id) => !retainedSectionIds.has(id))
    if (sectionIdsToDelete.length) {
      const result = await supabase.from('variation_order_sections').delete().in('id', sectionIdsToDelete).eq('variation_order_id', order.id).eq('company_id', companyId)
      if (result.error) throw result.error
    }

    const { data: refreshedOrder, error: refreshError } = await supabase.from('variation_orders').select('*').eq('id', order.id).eq('company_id', companyId).single()
    if (refreshError) throw refreshError
    const nextDraft: VariationOrderDraft = { ...draft, title: savedOrder.title, reason: savedOrder.reason, time_impact_days: String(savedOrder.time_impact_days), sections: savedSections, saved_at: refreshedOrder.updated_at }
    setOrder(refreshedOrder)
    setDraft(nextDraft)
    clearVariationOrderDraft(user.id, order.id)
    saveVariationOrderDraft(user.id, order.id, nextDraft)
    return { order: refreshedOrder, draft: nextDraft }
  }

  async function saveDraft() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await persistDatabaseDraft()
      setNotice('Draf Variation Order disimpan dalam database.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Draf tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function sendOrder() {
    if (!supabase || !draft || !user || !order) return
    const validationError = validateDraft(true)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!window.confirm('Hantar revision ini? Kandungan akan dikunci dan snapshot kekal akan direkodkan.')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await persistDatabaseDraft()
      const { data, error: sendError } = await supabase.rpc('send_variation_order_revision', { p_variation_order_id: order.id })
      if (sendError) throw sendError
      setOrder(data)
      setDraft((current) => current ? { ...current, status: data.status, saved_at: data.updated_at } : current)
      clearVariationOrderDraft(user.id, order.id)
      setNotice(`${variationOrderNumber(data.vo_no, data.revision_no)} telah dihantar dan dikunci.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Variation Order tidak dapat dihantar.')
    } finally {
      setBusy(false)
    }
  }

  async function startRevision() {
    if (!supabase || !order || !user || !window.confirm('Mulakan revision baharu untuk mengubah VO ini?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: revisionError } = await supabase.rpc('start_variation_order_revision', { p_variation_order_id: order.id })
      if (revisionError) throw revisionError
      const nextDraft = draft ? { ...draft, status: data.status, revision_no: data.revision_no, saved_at: data.updated_at } : null
      setOrder(data)
      setDraft(nextDraft)
      if (nextDraft) saveVariationOrderDraft(user.id, order.id, nextDraft)
      setNotice(`Revision ${data.revision_no} telah dibuka. Kandungan boleh diedit semula.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Revision baharu tidak dapat dimulakan.')
    } finally {
      setBusy(false)
    }
  }

  async function recordDecision(decision: 'approved' | 'rejected') {
    if (!supabase || !order || !user) return
    const label = decision === 'approved' ? 'Luluskan' : 'Tolak'
    if (!window.confirm(`${label} ${variationOrderNumber(order.vo_no, order.revision_no)} menggunakan kaedah ${approvalMethodLabel(approvalMethod)}?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: decisionError } = await supabase.rpc('record_variation_order_decision', {
        p_variation_order_id: order.id,
        p_decision: decision,
        p_approval_method: approvalMethod,
        p_approval_note: approvalNote.trim() || null,
      })
      if (decisionError) throw decisionError
      setOrder(data)
      setDraft((current) => current ? { ...current, status: data.status, saved_at: data.updated_at } : current)
      clearVariationOrderDraft(user.id, order.id)
      if (decision === 'approved' && companyId && project) {
        const { data: refreshedProject } = await supabase.from('projects').select('*').eq('id', project.id).eq('company_id', companyId).maybeSingle()
        if (refreshedProject) setProject(refreshedProject)
      }
      setNotice(decision === 'approved' ? 'VO diluluskan. Nilai kontrak semasa projek telah dikemas kini.' : 'Keputusan penolakan telah direkodkan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Keputusan tidak dapat direkodkan.')
    } finally {
      setBusy(false)
    }
  }

  function openWhatsApp() {
    if (!draft || !project) return
    const phone = whatsappNumber(project.client_phone)
    if (!phone) {
      setError('Nombor telefon pelanggan tidak sah untuk WhatsApp.')
      return
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildVariationOrderWhatsAppText(draft, project))}`, '_blank', 'noopener,noreferrer')
  }

  async function openPrint() {
    if (!project || !order) return
    if (!editable) {
      navigate(`/projek/${project.id}/vo/${order.id}/cetak`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await persistDatabaseDraft()
      navigate(`/projek/${project.id}/vo/${order.id}/cetak`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Draf mesti disimpan sebelum PDF dibuka.')
      setBusy(false)
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan Variation Order...</div>
  if (!project || !order || !draft) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><AlertTriangle className="h-8 w-8 text-red-700" /><h1 className="mt-4 text-xl font-black">Variation Order tidak dapat dibuka</h1>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}<button type="button" onClick={() => navigate(`/projek/${projectId}`)} className="mt-4 min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Kembali ke Projek</button></section>

  const proposedContract = Number(project.current_contract_amount) + (order.status === 'approved' ? 0 : total)

  return (
    <div className="space-y-5 pb-24 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start gap-3"><button type="button" onClick={() => navigate(`/projek/${project.id}`)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10" aria-label="Kembali ke projek"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${variationOrderStatusTone(order.status)}`}>{variationOrderStatusLabel(order.status)}</span><span className="text-xs font-bold text-slate-400">{project.project_no}</span></div><h1 className="mt-3 text-2xl font-black tracking-tight">{variationOrderNumber(order.vo_no, order.revision_no)}</h1><p className="mt-1 text-sm font-semibold text-slate-300">{project.client_name} · {project.project_name}</p></div></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3.5"><p className="text-xs font-bold text-slate-400">Perubahan bersih</p><p className={`mt-1 text-lg font-black ${total < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatSignedMoney(total)}</p></div><div className="rounded-2xl bg-white/10 p-3.5 text-right"><p className="text-xs font-bold text-slate-400">Kontrak selepas VO</p><p className="mt-1 text-lg font-black text-amber-300">{formatMoney(proposedContract)}</p></div></div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      {!editable && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><strong>Kandungan dikunci.</strong> {order.status === 'approved' ? 'VO yang diluluskan kekal sebagai rekod kontrak.' : order.status === 'sent' ? 'Rekod keputusan pelanggan, atau buka revision baharu jika kandungan perlu diubah.' : 'VO yang ditolak boleh dibuka sebagai revision baharu.'}</section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div><p className="text-sm font-bold text-amber-700">Maklumat perubahan</p><h2 className="mt-1 text-xl font-black">Sebab dan kesan masa</h2></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="field-label">Tarikh VO</span><input type="date" value={draft.vo_date} disabled={!editable} onChange={(event) => updateDraft({ vo_date: event.target.value })} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">Kesan masa (hari)</span><input type="number" step="1" min="-3650" max="3650" value={draft.time_impact_days} disabled={!editable} onChange={(event) => updateDraft({ time_impact_days: event.target.value })} className="field-control disabled:bg-slate-100" /><span className="mt-1 block text-xs text-slate-500">Positif = tambah masa; negatif = kurangkan masa.</span></label>
          <label className="block sm:col-span-2"><span className="field-label">Tajuk *</span><input value={draft.title} disabled={!editable} onChange={(event) => updateDraft({ title: event.target.value })} className="field-control disabled:bg-slate-100" /></label>
          <label className="block sm:col-span-2"><span className="field-label">Sebab perubahan *</span><textarea value={draft.reason} disabled={!editable} onChange={(event) => updateDraft({ reason: event.target.value })} className="field-control disabled:bg-slate-100" placeholder="Contoh: Perubahan diminta pelanggan selepas kerja asal dipersetujui." /></label>
        </div>
      </section>

      {editable && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:p-6"><p className="text-sm font-bold text-amber-800">Tambah kawasan kerja</p><div className="mt-3 flex gap-2"><input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSection(newSectionName) } }} className="field-control bg-white" placeholder="Contoh: Porch" /><button type="button" onClick={() => addSection(newSectionName)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-white" aria-label="Tambah kawasan"><Plus className="h-5 w-5" /></button></div>{projectSections.some((section) => !usedSourceSectionIds.has(section.id)) && <div className="mt-4"><p className="text-xs font-bold text-amber-900">Atau rujuk kawasan skop asal:</p><div className="mt-2 flex flex-wrap gap-2">{projectSections.filter((section) => !usedSourceSectionIds.has(section.id)).map((section) => <button key={section.id} type="button" onClick={() => addSection(section.name, section.id)} className="min-h-10 rounded-full border border-amber-300 bg-white px-4 text-xs font-black text-slate-700">+ {section.name}</button>)}</div></div>}</section>}

      <section className="space-y-4">
        <div><p className="text-sm font-bold text-amber-700">Butiran Variation Order</p><h2 className="mt-1 text-xl font-black">Perubahan mengikut kawasan</h2><p className="mt-1 text-sm leading-6 text-slate-600">Pilih Skop Asal untuk pengurangan, Katalog untuk tambahan, atau masukkan item manual.</p></div>
        {draft.sections.map((section, sectionIndex) => <article key={section.local_id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 p-4"><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kawasan kerja {section.source_project_section_id ? '· Skop asal' : ''}</p><h3 className="mt-1 truncate font-black">{section.name}</h3></div>{editable && <div className="flex shrink-0 gap-1"><IconButton label="Naik" disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}><ArrowUp /></IconButton><IconButton label="Turun" disabled={sectionIndex === draft.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}><ArrowDown /></IconButton><IconButton label="Namakan semula" onClick={() => renameSection(section)}><Pencil /></IconButton><IconButton label="Buang" danger onClick={() => removeSection(section)}><Trash2 /></IconButton></div>}</header><div className="divide-y divide-slate-100 px-4">{section.items.map((item, itemIndex) => <div key={item.local_id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.direction === 'deduct' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{variationChangeTypeLabel(item.change_type)}</span>{item.source_project_item_id && <span className="text-[10px] font-bold text-blue-700">Rujukan skop asal</span>}</div><p className="mt-2 font-black">{item.item_name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>{item.measurement_text && <p className="mt-1 text-xs font-semibold text-blue-700">{item.measurement_text}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">{Number(item.quantity)} {item.unit} × {formatMoney(Number(item.rate))}</p></div><p className={`shrink-0 font-black ${item.direction === 'deduct' ? 'text-red-700' : 'text-emerald-700'}`}>{formatSignedMoney(variationOrderItemAmount(item))}</p></div>{editable && <div className="mt-3 flex gap-2"><button type="button" onClick={() => openItemDialog(section.local_id, item)} className="min-h-10 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700">Edit</button><IconButton label="Naik" disabled={itemIndex === 0} onClick={() => moveItem(section.local_id, itemIndex, -1)}><ArrowUp /></IconButton><IconButton label="Turun" disabled={itemIndex === section.items.length - 1} onClick={() => moveItem(section.local_id, itemIndex, 1)}><ArrowDown /></IconButton><IconButton label="Buang item" danger onClick={() => removeItem(section.local_id, item)}><Trash2 /></IconButton></div>}</div>)}{!section.items.length && <p className="py-5 text-center text-sm text-slate-500">Belum ada perubahan dalam kawasan ini.</p>}</div>{editable && <footer className="border-t border-slate-100 p-4"><button type="button" onClick={() => openItemDialog(section.local_id, null)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-black text-slate-700"><Plus className="h-5 w-5" />Tambah Item Perubahan</button></footer>}</article>)}
        {!draft.sections.length && <p className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm leading-6 text-slate-500">Tambah sekurang-kurangnya satu kawasan kerja untuk merekod perubahan nilai. Jika VO hanya memberi kesan masa, kawasan boleh dibiarkan kosong.</p>}
      </section>

      <section className="rounded-3xl bg-slate-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-slate-400">Jumlah perubahan bersih</p><p className="mt-1 text-xs text-slate-500">{itemCount} item · tambah ditolak pengurangan</p></div><p className={`text-2xl font-black ${total < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatSignedMoney(total)}</p></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm"><div><p className="text-xs text-slate-500">Kontrak asal</p><p className="mt-1 font-black">{formatMoney(Number(project.contract_amount))}</p></div><div className="text-right"><p className="text-xs text-slate-500">{order.status === 'approved' ? 'Kontrak semasa' : 'Jika VO diluluskan'}</p><p className="mt-1 font-black text-amber-300">{formatMoney(proposedContract)}</p></div></div></section>

      {order.status === 'sent' && <section className="rounded-3xl border border-blue-200 bg-blue-50 p-4 sm:p-6"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-6 w-6 text-blue-700" /><div><p className="text-sm font-bold text-blue-700">Keputusan pelanggan</p><h2 className="mt-1 text-xl font-black text-blue-950">Rekod persetujuan atau penolakan</h2><p className="mt-1 text-sm leading-6 text-blue-900">Tiada tandatangan digital diperlukan. Rekod cara keputusan diterima dan nota sokongan jika ada.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Kaedah keputusan</span><select value={approvalMethod} onChange={(event) => setApprovalMethod(event.target.value as ApprovalMethod)} className="field-control"><option value="whatsapp">WhatsApp</option><option value="verbal">Lisan</option><option value="written">Dokumen bertulis</option><option value="other">Lain-lain</option></select></label><label className="block sm:col-span-2"><span className="field-label">Nota keputusan</span><textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} className="field-control" placeholder="Pilihan: tarikh, nama atau rujukan mesej." /></label></div><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={() => void recordDecision('rejected')} className="min-h-12 rounded-xl border border-red-300 bg-white px-4 text-sm font-black text-red-700 disabled:opacity-60">Rekod Ditolak</button><button type="button" disabled={busy} onClick={() => void recordDecision('approved')} className="min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60">Rekod Diluluskan</button></div></section>}

      {(order.status === 'approved' || order.status === 'rejected') && <section className={`rounded-3xl border p-5 ${order.status === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-100'}`}><p className="text-sm font-black">Keputusan: {variationOrderStatusLabel(order.status)}</p><p className="mt-2 text-sm">Kaedah: <strong>{approvalMethodLabel(order.approval_method)}</strong></p>{order.approval_note && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{order.approval_note}</p>}</section>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {editable && <button type="button" disabled={busy} onClick={() => void saveDraft()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"><Save className="h-5 w-5" />Simpan Draf</button>}
        {editable && <button type="button" disabled={busy} onClick={() => void sendOrder()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60"><Send className="h-5 w-5" />Simpan & Hantar</button>}
        <button type="button" disabled={busy} onClick={() => void openPrint()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"><FileDown className="h-5 w-5" />PDF</button>
        <button type="button" onClick={openWhatsApp} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white"><MessageCircle className="h-5 w-5" />WhatsApp</button>
        {(order.status === 'sent' || order.status === 'rejected') && <button type="button" disabled={busy} onClick={() => void startRevision()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm font-black text-blue-800 disabled:opacity-60"><RefreshCw className="h-5 w-5" />Mulakan Revision</button>}
      </section>

      {editable && <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><History className="h-4 w-4" />{autosaveNotice}. Draf item yang sedang dibuka juga dipulihkan selepas bertukar app.</p>}

      {itemDialog && <VariationOrderItemDialog categories={categories} catalogItems={catalogItems} projectItems={projectItems} initialItem={itemDialog.item} initialDraft={itemDialog.initialDraft} onClose={closeItemDialog} onDraftChange={persistItemComposer} onSave={saveItem} />}
    </div>
  )
}

function IconButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={label} className={`grid h-10 w-10 place-items-center rounded-xl disabled:opacity-30 [&>svg]:h-4 [&>svg]:w-4 ${danger ? 'bg-red-50 text-red-700' : 'bg-white text-slate-600'}`}>{children}</button>
}
