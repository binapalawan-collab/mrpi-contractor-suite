import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  ClipboardPenLine,
  FileCheck2,
  FileDown,
  FolderKanban,
  History,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link } from 'wouter'
import type { CatalogCategory, CatalogItem } from '../../lib/catalog'
import {
  buildProjectTitle,
  formatMoney,
  formatQuotationNumber,
  localId,
  quotationDraftTotal,
  quotationItemAmount,
  quotationStatusLabel,
  type QuotationDraft,
  type QuotationDraftItem,
  type QuotationDraftSection,
} from '../../lib/quotation'
import type { Client, SiteVisitArea, SiteVisitEntry } from '../../lib/siteVisit'
import { QuotationItemDialog } from './QuotationItemDialog'
import { useMemo, useState } from 'react'
import {
  clearQuotationItemDraft,
  readQuotationItemDraft,
  saveQuotationItemDraft,
  type StoredQuotationItemEditorDraft,
} from '../../lib/quotationDrafts'

type SourceNote = {
  note_text: string
  measurement_text: string | null
}

type ItemDialogState = {
  sectionLocalId: string
  item: QuotationDraftItem | null
  sourceNote: SourceNote | null
  initialDraft: StoredQuotationItemEditorDraft | null
}

type Props = {
  draft: QuotationDraft
  clients: Client[]
  categories: CatalogCategory[]
  catalogItems: CatalogItem[]
  sourceAreas: SiteVisitArea[]
  sourceEntries: SiteVisitEntry[]
  draftOwnerUserId: string
  draftStorageId: string
  editable: boolean
  busy: boolean
  autosaveNotice: string
  onChange: (draft: QuotationDraft) => void
  onBack: () => void
  onSave: () => Promise<void>
  onSend: () => Promise<void>
  onStartRevision: () => Promise<void>
  onAccept: () => Promise<void>
  onContinueAsProject: () => Promise<void>
  onPrint: () => void
  onWhatsApp: () => void
}

export function QuotationComposer({
  draft,
  clients,
  categories,
  catalogItems,
  sourceAreas,
  sourceEntries,
  draftOwnerUserId,
  draftStorageId,
  editable,
  busy,
  autosaveNotice,
  onChange,
  onBack,
  onSave,
  onSend,
  onStartRevision,
  onAccept,
  onContinueAsProject,
  onPrint,
  onWhatsApp,
}: Props) {
  const [newSectionName, setNewSectionName] = useState('')
  const areaMap = useMemo(() => new Map(sourceAreas.map((area) => [area.id, area])), [sourceAreas])
  const entryMap = useMemo(() => new Map(sourceEntries.map((entry) => [entry.id, entry])), [sourceEntries])
  const activeSourceEntries = useMemo(() => sourceEntries.filter((entry) => entry.is_active), [sourceEntries])
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(() => {
    if (!draftOwnerUserId || !draftStorageId) return null
    const stored = readQuotationItemDraft(draftOwnerUserId, draftStorageId)
    if (!stored) return null
    if (!draft.sections.some((section) => section.local_id === stored.section_local_id)) {
      clearQuotationItemDraft(draftOwnerUserId, draftStorageId)
      return null
    }
    const sourceEntry = stored.item.source_site_visit_entry_id
      ? entryMap.get(stored.item.source_site_visit_entry_id) ?? null
      : null
    return {
      sectionLocalId: stored.section_local_id,
      item: stored.item,
      sourceNote: stored.source_note ?? (sourceEntry ? {
        note_text: sourceEntry.note_text,
        measurement_text: sourceEntry.measurement_text,
      } : null),
      initialDraft: stored,
    }
  })
  const usedEntryCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const section of draft.sections) {
      for (const item of section.items) {
        if (item.source_site_visit_entry_id) counts.set(item.source_site_visit_entry_id, (counts.get(item.source_site_visit_entry_id) ?? 0) + 1)
      }
    }
    return counts
  }, [draft.sections])
  const total = quotationDraftTotal(draft)
  const itemCount = draft.sections.reduce((count, section) => count + section.items.length, 0)

  function updateHeader<K extends keyof QuotationDraft['header']>(key: K, value: QuotationDraft['header'][K]) {
    onChange({ ...draft, header: { ...draft.header, [key]: value } })
  }

  function updateSections(sections: QuotationDraftSection[]) {
    onChange({ ...draft, sections })
  }

  function closeItemDialog() {
    clearQuotationItemDraft(draftOwnerUserId, draftStorageId)
    setItemDialog(null)
  }

  function openItemDialog(dialog: Omit<ItemDialogState, 'initialDraft'>) {
    clearQuotationItemDraft(draftOwnerUserId, draftStorageId)
    setItemDialog({ ...dialog, initialDraft: null })
  }

  function chooseClient(clientId: string) {
    if (!clientId) {
      updateHeader('client_id', null)
      return
    }
    const client = clients.find((candidate) => candidate.id === Number(clientId))
    if (!client) return
    onChange({
      ...draft,
      header: {
        ...draft.header,
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email ?? '',
      },
    })
  }

  function addSection() {
    const name = newSectionName.trim()
    if (!name) return
    updateSections([...draft.sections, {
      local_id: localId(),
      id: null,
      source_site_visit_id: null,
      source_site_visit_area_id: null,
      name,
      items: [],
    }])
    setNewSectionName('')
  }

  function renameSection(section: QuotationDraftSection) {
    const name = window.prompt('Nama ruangan kerja', section.name)?.trim()
    if (!name) return
    updateSections(draft.sections.map((candidate) => candidate.local_id === section.local_id ? { ...candidate, name } : candidate))
  }

  function removeSection(section: QuotationDraftSection) {
    if (!window.confirm(`Buang ruangan “${section.name}” dan semua item di dalamnya?`)) return
    updateSections(draft.sections.filter((candidate) => candidate.local_id !== section.local_id))
  }

  function moveSection(index: number, direction: -1 | 1) {
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

  function saveItem(sectionLocalId: string, item: QuotationDraftItem) {
    updateSections(draft.sections.map((section) => {
      if (section.local_id !== sectionLocalId) return section
      const exists = section.items.some((candidate) => candidate.local_id === item.local_id)
      return { ...section, items: exists ? section.items.map((candidate) => candidate.local_id === item.local_id ? item : candidate) : [...section.items, item] }
    }))
    closeItemDialog()
  }

  function removeItem(sectionLocalId: string, item: QuotationDraftItem) {
    if (!window.confirm(`Buang item “${item.item_name}”?`)) return
    updateSections(draft.sections.map((section) => section.local_id === sectionLocalId
      ? { ...section, items: section.items.filter((candidate) => candidate.local_id !== item.local_id) }
      : section))
  }

  function moveItem(sectionLocalId: string, index: number, direction: -1 | 1) {
    updateSections(draft.sections.map((section) => {
      if (section.local_id !== sectionLocalId) return section
      const target = index + direction
      if (target < 0 || target >= section.items.length) return section
      const items = [...section.items]
      const currentItem = items[index]
      const targetItem = items[target]
      if (!currentItem || !targetItem) return section
      items[index] = targetItem
      items[target] = currentItem
      return { ...section, items }
    }))
  }

  function useSourceEntry(entry: SiteVisitEntry) {
    const sourceArea = areaMap.get(entry.area_id)
    let targetSection = draft.sections.find((section) => section.source_site_visit_area_id === entry.area_id) ?? null
    if (!targetSection) {
      targetSection = {
        local_id: localId(),
        id: null,
        source_site_visit_id: entry.site_visit_id,
        source_site_visit_area_id: entry.area_id,
        name: sourceArea?.name ?? 'Ruangan Kerja',
        items: [],
      }
      updateSections([...draft.sections, targetSection])
    }
    const item: QuotationDraftItem = {
      local_id: localId(),
      id: null,
      catalog_item_id: null,
      source_site_visit_id: entry.site_visit_id,
      source_site_visit_area_id: entry.area_id,
      source_site_visit_entry_id: entry.id,
      item_name: '',
      description: '',
      measurement_text: [entry.note_text, entry.measurement_text].filter(Boolean).join(' · '),
      calculation_method: 'qty',
      unit: 'unit',
      quantity: '1',
      rate: '0.00',
    }
    openItemDialog({
      sectionLocalId: targetSection.local_id,
      item,
      sourceNote: { note_text: entry.note_text, measurement_text: entry.measurement_text },
    })
  }

  const statusTone = draft.status === 'accepted'
    ? 'bg-emerald-100 text-emerald-800'
    : draft.status === 'sent'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-amber-100 text-amber-800'

  return (
    <div className="space-y-5 pb-24 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-black ${statusTone}`}>{quotationStatusLabel(draft.status)}</span>
              {draft.revision_no > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white">Revision {draft.revision_no}</span>}
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight">{draft.quotation_id ? formatQuotationNumber(draft.header.quotation_no, draft.revision_no) : 'Sebutharga Baharu'}</h1>
            <p className="mt-2 text-xs font-semibold text-slate-400">{autosaveNotice}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3.5"><p className="text-xs font-bold text-slate-400">Item</p><p className="mt-1 text-xl font-black">{itemCount}</p></div>
          <div className="rounded-2xl bg-white/10 p-3.5 text-right"><p className="text-xs font-bold text-slate-400">Jumlah</p><p className="mt-1 text-xl font-black text-amber-300">{formatMoney(total)}</p></div>
        </div>
      </header>

      {!editable && (
        <section className={`rounded-2xl border p-4 ${draft.status === 'accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
          <p className="flex items-start gap-2 text-sm font-bold"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" />{draft.status === 'accepted' ? 'Sebutharga ini telah diterima dan dikunci. Ia tidak boleh diedit atau dipadam.' : 'Salinan revision ini telah dihantar. Mulakan revision baharu untuk membuat perubahan.'}</p>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-bold text-amber-700">Langkah 1</p><h2 className="mt-1 text-xl font-black">Pelanggan & projek</h2></div>
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" disabled={!editable} onClick={() => updateHeader('language', 'ms')} className={`min-h-9 rounded-lg px-3 text-xs font-black ${draft.header.language === 'ms' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>BM</button>
            <button type="button" disabled={!editable} onClick={() => updateHeader('language', 'en')} className={`min-h-9 rounded-lg px-3 text-xs font-black ${draft.header.language === 'en' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>EN</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="field-label">Pilih pelanggan sedia ada</span>
            <select disabled={!editable} value={draft.header.client_id ?? ''} onChange={(event) => chooseClient(event.target.value)} className="field-control disabled:bg-slate-100">
              <option value="">Isi pelanggan baharu / manual</option>
              {clients.filter((client) => client.is_active).map((client) => <option key={client.id} value={client.id}>{client.name} — {client.phone}</option>)}
            </select>
          </label>
          <label className="block"><span className="field-label">Nama pelanggan *</span><input disabled={!editable} value={draft.header.client_name} onChange={(event) => updateHeader('client_name', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">No. telefon *</span><input disabled={!editable} inputMode="tel" value={draft.header.client_phone} onChange={(event) => updateHeader('client_phone', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block sm:col-span-2"><span className="field-label">E-mel pelanggan</span><input disabled={!editable} type="email" value={draft.header.client_email} onChange={(event) => updateHeader('client_email', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">No. sebutharga</span><input disabled={!editable} value={draft.header.quotation_no} onChange={(event) => updateHeader('quotation_no', event.target.value)} className="field-control disabled:bg-slate-100" placeholder="AUTO selepas Simpan Draf" /><span className="mt-1.5 block text-xs text-slate-500">Format auto SHDDMMYY-XX; masih boleh diubah semasa draf.</span></label>
          <label className="block"><span className="field-label">Tarikh</span><input disabled={!editable} type="date" value={draft.header.quotation_date} onChange={(event) => updateHeader('quotation_date', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block sm:col-span-2"><span className="field-label">Alamat projek baris 1 *</span><input disabled={!editable} value={draft.header.address_line_1} onChange={(event) => updateHeader('address_line_1', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block sm:col-span-2"><span className="field-label">Alamat projek baris 2</span><input disabled={!editable} value={draft.header.address_line_2} onChange={(event) => updateHeader('address_line_2', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">Poskod</span><input disabled={!editable} inputMode="numeric" value={draft.header.postcode} onChange={(event) => updateHeader('postcode', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">Bandar / daerah *</span><input disabled={!editable} value={draft.header.city} onChange={(event) => updateHeader('city', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">Negeri *</span><input disabled={!editable} value={draft.header.state} onChange={(event) => updateHeader('state', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block"><span className="field-label">Sah (hari)</span><input disabled={!editable} inputMode="numeric" value={draft.header.validity_days} onChange={(event) => updateHeader('validity_days', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
          <label className="block sm:col-span-2">
            <span className="flex items-center justify-between gap-3"><span className="field-label">Tajuk sebutharga *</span>{editable && <button type="button" onClick={() => updateHeader('project_title', buildProjectTitle(draft.header.language, [draft.header.address_line_1, draft.header.city].filter(Boolean).join(', ')))} className="mb-1.5 inline-flex items-center gap-1 text-xs font-black text-amber-700"><RefreshCw className="h-3.5 w-3.5" />Jana semula</button>}</span>
            <textarea disabled={!editable} value={draft.header.project_title} onChange={(event) => updateHeader('project_title', event.target.value)} className="field-control min-h-24 disabled:bg-slate-100" />
          </label>
          <label className="block sm:col-span-2"><span className="field-label">Catatan / terma tambahan</span><textarea disabled={!editable} value={draft.header.notes} onChange={(event) => updateHeader('notes', event.target.value)} className="field-control min-h-20 disabled:bg-slate-100" placeholder="Pilihan. Tempoh siap, pengecualian atau nota tambahan." /></label>
        </div>
      </section>

      {draft.source_site_visit_id !== null && (
        <section className="rounded-3xl border border-blue-200 bg-blue-50 p-4 sm:p-6">
          <div className="flex items-start gap-3"><ClipboardPenLine className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" /><div><p className="text-sm font-bold text-blue-700">Rujukan Lawatan Tapak · {activeSourceEntries.length} catatan</p><h2 className="mt-1 text-xl font-black text-blue-950">Pilih catatan yang diperlukan</h2><p className="mt-2 text-sm leading-6 text-blue-900">Sebutharga ini dipautkan kepada lawatan tapak. Tiada catatan menjadi item atau harga secara automatik—kau tetap pilih item katalog atau isi item manual sendiri.</p></div></div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {activeSourceEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-blue-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800">{areaMap.get(entry.area_id)?.name ?? 'Kawasan'}</span>{entry.needs_confirmation && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800">Perlu Pengesahan</span>}{usedEntryCounts.has(entry.id) && <span className="text-[10px] font-black text-emerald-700">Digunakan {usedEntryCounts.get(entry.id)}×</span>}</div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{entry.note_text}</p>
                {entry.measurement_text && <p className="mt-1 text-xs text-slate-500">Ukuran: {entry.measurement_text}</p>}
                {editable && <button type="button" onClick={() => useSourceEntry(entry)} className="mt-3 min-h-10 w-full rounded-xl bg-slate-950 px-3 text-xs font-black text-white">Pilih Item untuk Catatan Ini</button>}
              </article>
            ))}
            {!activeSourceEntries.length && <p className="rounded-2xl border border-dashed border-blue-300 bg-white p-4 text-sm font-semibold text-blue-900">Lawatan tapak ini belum mempunyai catatan aktif untuk dipilih.</p>}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div><p className="text-sm font-bold text-amber-700">Langkah 2</p><h2 className="mt-1 text-xl font-black">Ruangan & item kerja</h2><p className="mt-1 text-sm leading-6 text-slate-600">Item dikumpulkan mengikut ruangan. Gunakan anak panah untuk susun kedudukan sebelum PDF dijana.</p></div>

        {draft.sections.map((section, sectionIndex) => (
          <article key={section.local_id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><MapPin className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ruangan {sectionIndex + 1}</p><h3 className="truncate font-black text-slate-950">{section.name}</h3></div>
              {editable && <div className="flex gap-1"><button type="button" disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 disabled:opacity-25" aria-label="Naikkan ruangan"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={sectionIndex === draft.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 disabled:opacity-25" aria-label="Turunkan ruangan"><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => renameSection(section)} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500" aria-label="Ubah nama ruangan"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => removeSection(section)} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600" aria-label="Buang ruangan"><Trash2 className="h-4 w-4" /></button></div>}
            </header>
            <div className="space-y-3 p-4">
              {section.items.map((item, itemIndex) => (
                <div key={item.local_id} className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{item.catalog_item_id ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">Katalog</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">Manual</span>}{item.source_site_visit_entry_id && <span className="text-[10px] font-black text-blue-700">Dari catatan tapak</span>}</div><p className="mt-2 font-black leading-5">{item.item_name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>{item.measurement_text && <p className="mt-1 text-xs font-semibold leading-5 text-blue-700">{item.measurement_text}</p>}</div>
                    {editable && <div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => {
                      const sourceEntry = item.source_site_visit_entry_id ? entryMap.get(item.source_site_visit_entry_id) ?? null : null
                      openItemDialog({
                        sectionLocalId: section.local_id,
                        item,
                        sourceNote: sourceEntry ? { note_text: sourceEntry.note_text, measurement_text: sourceEntry.measurement_text } : null,
                      })
                    }} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600" aria-label="Edit item"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => removeItem(section.local_id, item)} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600" aria-label="Buang item"><Trash2 className="h-4 w-4" /></button></div>}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3"><div><p className="text-xs font-semibold text-slate-500">{item.quantity} {item.unit} × {formatMoney(Number(item.rate) || 0)}</p><p className="mt-1 text-lg font-black">{formatMoney(quotationItemAmount(item))}</p></div>{editable && <div className="flex gap-1"><button type="button" disabled={itemIndex === 0} onClick={() => moveItem(section.local_id, itemIndex, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-25" aria-label="Naikkan item"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={itemIndex === section.items.length - 1} onClick={() => moveItem(section.local_id, itemIndex, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-25" aria-label="Turunkan item"><ArrowDown className="h-4 w-4" /></button></div>}</div>
                </div>
              ))}
              {editable && <button type="button" onClick={() => openItemDialog({ sectionLocalId: section.local_id, item: null, sourceNote: null })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-sm font-black text-amber-900"><Plus className="h-5 w-5" />Tambah Item</button>}
              {!section.items.length && !editable && <p className="py-5 text-center text-sm text-slate-400">Tiada item dalam ruangan ini.</p>}
            </div>
          </article>
        ))}

        {editable && <div className="flex gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-3"><input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSection() } }} className="field-control" placeholder="Nama ruangan baharu, contoh: Porch" /><button type="button" onClick={addSection} className="min-h-12 shrink-0 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"><Plus className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Tambah Ruangan</span></button></div>}
      </section>

      <section className="rounded-3xl bg-slate-950 p-5 text-white sm:p-6">
        <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-bold text-slate-400">Jumlah keseluruhan</p><p className="mt-2 text-3xl font-black text-amber-300">{formatMoney(total)}</p></div><BookOpenCheck className="h-9 w-9 text-white/20" /></div>
        <p className="mt-3 text-xs leading-5 text-slate-400">Semua kadar dan kuantiti boleh diubah secara manual semasa status masih Draf.</p>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {editable && <button type="button" disabled={busy} onClick={() => void onSave()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"><Save className="h-5 w-5" />Simpan Draf</button>}
        {editable && <button type="button" disabled={busy || itemCount === 0} onClick={() => void onSend()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-40"><Send className="h-5 w-5" />Tanda Dihantar</button>}
        {draft.status === 'sent' && <button type="button" disabled={busy} onClick={() => void onStartRevision()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm font-black text-blue-900 disabled:opacity-60"><History className="h-5 w-5" />Buat Revision</button>}
        {draft.status === 'sent' && <button type="button" disabled={busy} onClick={() => void onAccept()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60"><CheckCircle2 className="h-5 w-5" />Tanda Diterima</button>}
        {draft.status === 'accepted' && <button type="button" disabled={busy} onClick={() => void onContinueAsProject()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60"><FolderKanban className="h-5 w-5" />Teruskan Sebagai Projek</button>}
        <button type="button" disabled={!draft.quotation_id || busy} onClick={onPrint} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-40"><FileDown className="h-5 w-5" />PDF / Cetak</button>
        <button type="button" disabled={!draft.header.client_phone || busy} onClick={onWhatsApp} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-40"><MessageCircle className="h-5 w-5" />WhatsApp</button>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500"><span className="inline-flex items-center gap-1"><UserRound className="h-4 w-4" />{draft.header.client_name || 'Pelanggan belum diisi'}</span><Link href="/katalog" className="font-black text-amber-700">Buka Katalog & Harga</Link></div>

      {itemDialog && <QuotationItemDialog
        categories={categories}
        catalogItems={catalogItems}
        initialItem={itemDialog.item}
        initialDraft={itemDialog.initialDraft}
        sourceNote={itemDialog.sourceNote}
        onClose={closeItemDialog}
        onDraftChange={(itemDraft) => {
          saveQuotationItemDraft(draftOwnerUserId, draftStorageId, {
            section_local_id: itemDialog.sectionLocalId,
            ...itemDraft,
            source_note: itemDialog.sourceNote,
          })
        }}
        onSave={(item) => saveItem(itemDialog.sectionLocalId, item)}
      />}
    </div>
  )
}
