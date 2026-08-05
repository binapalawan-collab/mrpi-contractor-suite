import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Lightbulb,
  Images,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  Undo2,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  formatVisitDate,
  guidePrompts,
  type Client,
  type EntryFormValue,
  type SiteVisit,
  type SiteVisitArea,
  type SiteVisitEntry,
  type SiteVisitGuide,
  type SiteVisitPhoto,
} from '../../lib/siteVisit'
import {
  clearSiteVisitEntryDraft,
  readSiteVisitDraftFiles,
  readSiteVisitEntryDraft,
  readSiteVisitResume,
  saveSiteVisitDraftFiles,
  saveSiteVisitEntryDraft,
  saveSiteVisitResume,
} from '../../lib/siteVisitDrafts'

type EntrySaveResult = {
  entry: SiteVisitEntry
  photosSaved: boolean
  photoError?: string
}

type VisitWorkflowStatus = 'draft' | 'completed' | 'ready_for_quote'

type Props = {
  visit: SiteVisit
  client: Client
  areas: SiteVisitArea[]
  entries: SiteVisitEntry[]
  photos: SiteVisitPhoto[]
  guides: SiteVisitGuide[]
  photoUrls: Map<number, string>
  busy: boolean
  onBack: () => void
  onEditVisit: () => void
  onAddArea: (name: string) => Promise<void>
  onRenameArea: (area: SiteVisitArea, name: string) => Promise<void>
  onSaveEntry: (entry: SiteVisitEntry | null, value: EntryFormValue, files: File[]) => Promise<EntrySaveResult>
  onSetEntryArchived: (entry: SiteVisitEntry, archived: boolean) => Promise<void>
  onRemovePhoto: (photo: SiteVisitPhoto) => Promise<void>
  onSetStatus: (status: VisitWorkflowStatus) => Promise<void>
}

export function VisitWorkspace({
  visit,
  client,
  areas,
  entries,
  photos,
  guides,
  photoUrls,
  busy,
  onBack,
  onEditVisit,
  onAddArea,
  onRenameArea,
  onSaveEntry,
  onSetEntryArchived,
  onRemovePhoto,
  onSetStatus,
}: Props) {
  const activeAreas = useMemo(() => areas.filter((area) => area.is_active), [areas])
  const resumeState = readSiteVisitResume(visit.owner_user_id)
  const resumableWorkspace = resumeState?.mode === 'workspace' && resumeState.visit_id === visit.id ? resumeState : null
  const storedEntryDraft = readSiteVisitEntryDraft(visit.owner_user_id, visit.id)?.value ?? null
  const restoredEntry = resumableWorkspace?.entry_open && resumableWorkspace.entry_id
    ? entries.find((entry) => entry.id === resumableWorkspace.entry_id) ?? null
    : null
  const restoredAreaId = resumableWorkspace?.selected_area_id
    ?? (storedEntryDraft ? Number(storedEntryDraft.form.area_id) : null)
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(activeAreas.some((area) => area.id === restoredAreaId) ? restoredAreaId : activeAreas[0]?.id ?? null)
  const [areaDialog, setAreaDialog] = useState<{ mode: 'add' | 'rename'; area?: SiteVisitArea } | null>(null)
  const [editingEntry, setEditingEntry] = useState<SiteVisitEntry | null>(restoredEntry)
  const [entryDialogOpen, setEntryDialogOpen] = useState(Boolean(resumableWorkspace?.entry_open && (resumableWorkspace.entry_id === null || restoredEntry)))

  useEffect(() => {
    if (selectedAreaId && activeAreas.some((area) => area.id === selectedAreaId)) return
    setSelectedAreaId(activeAreas[0]?.id ?? null)
  }, [activeAreas, selectedAreaId])

  useEffect(() => {
    saveSiteVisitResume(visit.owner_user_id, {
      mode: 'workspace',
      visit_id: visit.id,
      selected_area_id: selectedAreaId,
      entry_open: entryDialogOpen,
      entry_id: entryDialogOpen ? editingEntry?.id ?? null : null,
    })
  }, [editingEntry?.id, entryDialogOpen, selectedAreaId, visit.id, visit.owner_user_id])

  const selectedArea = activeAreas.find((area) => area.id === selectedAreaId) ?? null
  const visibleEntries = entries
    .filter((entry) => entry.area_id === selectedAreaId && entry.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const archivedEntries = entries.filter((entry) => entry.area_id === selectedAreaId && !entry.is_active)
  const photoGroups = useMemo(() => {
    const groups = new Map<number, SiteVisitPhoto[]>()
    for (const photo of photos) groups.set(photo.entry_id, [...(groups.get(photo.entry_id) ?? []), photo])
    return groups
  }, [photos])
  const guideMap = useMemo(() => new Map(guides.map((guide) => [guide.guide_key, guide])), [guides])
  const completed = visit.status === 'completed'
  const ready = visit.status === 'ready_for_quote' || visit.status === 'converted'

  function openAddEntry() {
    if (!selectedAreaId) return
    const savedDraft = readSiteVisitEntryDraft(visit.owner_user_id, visit.id)?.value
    const savedEntry = savedDraft?.entry_id
      ? entries.find((entry) => entry.id === savedDraft.entry_id) ?? null
      : null
    if (savedDraft && activeAreas.some((area) => area.id === Number(savedDraft.form.area_id))) {
      setSelectedAreaId(Number(savedDraft.form.area_id))
    }
    setEditingEntry(savedEntry)
    setEntryDialogOpen(true)
  }

  function openEditEntry(entry: SiteVisitEntry) {
    setEditingEntry(entry)
    setEntryDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Kembali ke senarai lawatan">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-black ${ready ? 'bg-emerald-400 text-emerald-950' : completed ? 'bg-blue-300 text-blue-950' : 'bg-amber-300 text-slate-950'}`}>
                {ready ? 'Sedia untuk sebutharga' : completed ? 'Site visit selesai' : 'Draf lawatan'}
              </span>
              <span className="text-xs font-semibold text-slate-400">{formatVisitDate(visit.visit_date)}</span>
            </div>
            <h1 className="mt-3 break-words text-2xl font-black tracking-tight">{visit.project_title}</h1>
          </div>
          <button type="button" onClick={onEditVisit} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Ubah maklumat lawatan">
            <Pencil className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex gap-3 rounded-2xl bg-white/10 p-3.5">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div><p className="font-bold">{client.name}</p><a className="mt-1 block text-slate-300" href={`tel:${client.phone_normalized}`}>{client.phone}</a></div>
          </div>
          <div className="flex gap-3 rounded-2xl bg-white/10 p-3.5">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p className="leading-6 text-slate-200">{[visit.address_line_1, visit.address_line_2, visit.postcode, visit.city, visit.state].filter(Boolean).join(', ')}</p>
          </div>
        </div>
      </header>

      {completed && (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-blue-900"><CheckCircle2 className="h-5 w-5" />Site visit telah selesai. Catatan masih boleh disemak sebelum quote.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void onSetStatus('draft')} className="min-h-11 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-900 disabled:opacity-60">Buka Semula</button>
            <button type="button" disabled={busy} onClick={() => void onSetStatus('ready_for_quote')} className="min-h-11 rounded-xl bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-60">Sediakan Sebutharga</button>
          </div>
        </div>
      )}

      {ready && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Lawatan ini menunggu aliran Sebutharga Baru.</p>
          {visit.status !== 'converted' && <button type="button" disabled={busy} onClick={() => void onSetStatus('completed')} className="text-left text-xs font-bold text-emerald-800 underline disabled:opacity-60">Kembali ke Site Visit Selesai</button>}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-700">Kawasan kerja</p>
            <h2 className="mt-1 text-xl font-black">Catat ikut tempat</h2>
          </div>
          <button type="button" disabled={busy} onClick={() => setAreaDialog({ mode: 'add' })} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-black text-slate-800 shadow-sm disabled:opacity-60">
            <Plus className="h-4 w-4" />Kawasan
          </button>
        </div>

        {activeAreas.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <div className="flex w-max gap-2">
              {activeAreas.map((area) => (
                <button key={area.id} type="button" onClick={() => setSelectedAreaId(area.id)} className={`min-h-11 rounded-full border px-4 text-sm font-black transition ${selectedAreaId === area.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                  {area.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAreaDialog({ mode: 'add' })} className="flex min-h-36 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 px-5 text-center">
            <Plus className="h-7 w-7 text-amber-700" />
            <span className="mt-3 font-black">Tambah kawasan pertama</span>
            <span className="mt-1 text-xs leading-5 text-slate-600">Contoh: Porch, Dapur, Bilik Air 1 atau Bilik Air 2</span>
          </button>
        )}
      </section>

      {selectedArea && (
        <section className="space-y-3 pb-20 lg:pb-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Catatan</p>
              <h2 className="mt-1 text-xl font-black">{selectedArea.name}</h2>
            </div>
            <button type="button" onClick={() => setAreaDialog({ mode: 'rename', area: selectedArea })} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100">
              <Pencil className="h-4 w-4" />Ubah nama
            </button>
          </div>

          {visibleEntries.length > 0 ? visibleEntries.map((entry) => {
            const guide = entry.guide_key ? guideMap.get(entry.guide_key) : null
            const entryPhotos = photoGroups.get(entry.id) ?? []
            return (
              <article key={entry.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap text-[15px] font-semibold leading-6 text-slate-900">{entry.note_text}</p>
                  <button type="button" onClick={() => openEditEntry(entry)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Ubah catatan"><Pencil className="h-4 w-4" /></button>
                </div>

                {entry.needs_confirmation && <p className="mt-3 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-orange-800"><AlertTriangle className="h-4 w-4" />Perlu Pengesahan</p>}

                {entry.measurement_text && <p className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold leading-5 text-blue-800"><Ruler className="mt-0.5 h-4 w-4 shrink-0" />{entry.measurement_text}</p>}

                {guide && (
                  <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-black text-amber-900">
                      <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />Panduan {guide.name_ms}</span>
                      <ChevronDown className="h-4 w-4" />
                    </summary>
                    <ul className="space-y-2 border-t border-amber-200 px-4 py-3 text-xs leading-5 text-amber-950">
                      {guidePrompts(guide.prompts_ms).map((prompt) => <li key={prompt} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{prompt}</li>)}
                    </ul>
                  </details>
                )}

                {entryPhotos.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {entryPhotos.map((photo) => (
                      <div key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                        {photoUrls.get(photo.id) ? <img src={photoUrls.get(photo.id)} alt={photo.caption ?? `Gambar ${photo.original_filename}`} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-xs font-bold text-slate-400">Memuatkan...</div>}
                        <button type="button" disabled={busy} onClick={() => void onRemovePhoto(photo)} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-slate-950/80 text-white disabled:opacity-60" aria-label="Buang gambar"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] font-semibold text-slate-400">{new Date(entry.updated_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}</span>
                  <button type="button" disabled={busy} onClick={() => void onSetEntryArchived(entry, true)} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-60"><Archive className="h-4 w-4" />Arkib</button>
                </div>
              </article>
            )
          }) : (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-5 py-10 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-black">Belum ada catatan</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Tulis apa sahaja yang pelanggan minta. Ukuran dan gambar tidak wajib.</p>
            </div>
          )}

          {archivedEntries.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-xs font-black text-slate-600">Catatan diarkibkan ({archivedEntries.length})</summary>
              <div className="space-y-2 border-t border-slate-100 p-3">
                {archivedEntries.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><p className="text-xs leading-5 text-slate-500 line-through">{entry.note_text}</p><button type="button" disabled={busy} onClick={() => void onSetEntryArchived(entry, false)} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm disabled:opacity-60"><Undo2 className="h-4 w-4" />Pulih</button></div>)}
              </div>
            </details>
          )}

          {visit.status === 'draft' && visibleEntries.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void onSetStatus('completed')} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-blue-300 bg-blue-50 px-4 text-sm font-black text-blue-900 disabled:opacity-60">
              <CheckCircle2 className="h-5 w-5" />Selesai Site Visit
            </button>
          )}
        </section>
      )}

      {selectedArea && (
        <button type="button" disabled={busy} onClick={openAddEntry} className="fixed bottom-24 right-4 z-20 flex min-h-14 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-black text-slate-950 shadow-xl shadow-amber-300/50 disabled:opacity-60 lg:bottom-8 lg:right-8">
          <Plus className="h-5 w-5" />Catatan
        </button>
      )}

      {areaDialog && (
        <AreaDialog
          mode={areaDialog.mode}
          initialName={areaDialog.area?.name ?? ''}
          saving={busy}
          onClose={() => setAreaDialog(null)}
          onSubmit={async (name) => {
            if (areaDialog.mode === 'rename' && areaDialog.area) await onRenameArea(areaDialog.area, name)
            else await onAddArea(name)
            setAreaDialog(null)
          }}
        />
      )}

      {entryDialogOpen && selectedAreaId && (
        <EntryDialog
          entry={editingEntry}
          initialAreaId={selectedAreaId}
          draftOwnerId={visit.owner_user_id}
          draftVisitId={visit.id}
          areas={activeAreas}
          guides={guides}
          saving={busy}
          onClose={() => { setEntryDialogOpen(false); setEditingEntry(null) }}
          onSubmit={async (value, files) => {
            const result = await onSaveEntry(editingEntry, value, files)
            if (!result.photosSaved) {
              const pendingDraft = readSiteVisitEntryDraft(visit.owner_user_id, visit.id)?.value
              if (pendingDraft) saveSiteVisitEntryDraft(visit.owner_user_id, visit.id, { ...pendingDraft, entry_id: result.entry.id })
              saveSiteVisitResume(visit.owner_user_id, { mode: 'workspace', visit_id: visit.id, selected_area_id: Number(value.area_id), entry_open: true, entry_id: result.entry.id })
              setEditingEntry(result.entry)
              throw new Error(`Catatan sudah disimpan. Gambar masih selamat dalam draf peranti dan boleh dicuba semula apabila internet stabil. ${result.photoError ?? ''}`.trim())
            }
            setSelectedAreaId(Number(value.area_id))
            setEntryDialogOpen(false)
            setEditingEntry(null)
          }}
        />
      )}
    </div>
  )
}

function AreaDialog({ mode, initialName, saving, onClose, onSubmit }: { mode: 'add' | 'rename'; initialName: string; saving: boolean; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Masukkan nama kawasan kerja.'); return }
    try { await onSubmit(trimmed) } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Kawasan tidak dapat disimpan.') }
  }

  return (
    <DialogFrame title={mode === 'add' ? 'Tambah kawasan kerja' : 'Ubah nama kawasan'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="block"><span className="field-label">Nama kawasan</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="field-control" placeholder="Contoh: Porch" /></label>
        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan Kawasan'}</button>
      </form>
    </DialogFrame>
  )
}

function EntryDialog({ entry, initialAreaId, draftOwnerId, draftVisitId, areas, guides, saving, onClose, onSubmit }: { entry: SiteVisitEntry | null; initialAreaId: number; draftOwnerId: string; draftVisitId: number; areas: SiteVisitArea[]; guides: SiteVisitGuide[]; saving: boolean; onClose: () => void; onSubmit: (value: EntryFormValue, files: File[]) => Promise<void> }) {
  const [restoredDraft] = useState(() => {
    const saved = readSiteVisitEntryDraft(draftOwnerId, draftVisitId)?.value ?? null
    return saved?.entry_id === (entry?.id ?? null) ? saved : null
  })
  const [form, setForm] = useState<EntryFormValue>({
    area_id: restoredDraft?.form.area_id ?? String(entry?.area_id ?? initialAreaId),
    note_text: restoredDraft?.form.note_text ?? entry?.note_text ?? '',
    measurement_text: restoredDraft?.form.measurement_text ?? entry?.measurement_text ?? '',
    guide_key: restoredDraft?.form.guide_key ?? entry?.guide_key ?? '',
    needs_confirmation: restoredDraft?.form.needs_confirmation ?? entry?.needs_confirmation ?? false,
  })
  const [files, setFiles] = useState<File[]>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [showMeasurement, setShowMeasurement] = useState(restoredDraft?.show_measurement ?? Boolean(entry?.measurement_text))
  const [showGuides, setShowGuides] = useState(restoredDraft?.show_guides ?? Boolean(entry?.guide_key))
  const [error, setError] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const draftRef = useRef<ReturnType<typeof currentDraftValue> | null>(null)
  const selectedGuide = guides.find((guide) => guide.guide_key === form.guide_key)

  function currentDraftValue() {
    return {
      entry_id: entry?.id ?? null,
      form,
      show_measurement: showMeasurement,
      show_guides: showGuides,
    }
  }

  draftRef.current = currentDraftValue()

  useEffect(() => {
    const updatedAt = saveSiteVisitEntryDraft(draftOwnerId, draftVisitId, currentDraftValue())
    if (updatedAt) setDraftSavedAt(updatedAt)
  }, [draftOwnerId, draftVisitId, entry?.id, form, showGuides, showMeasurement])

  useEffect(() => {
    let mounted = true
    if (!restoredDraft) {
      setFilesLoaded(true)
      void saveSiteVisitDraftFiles(draftOwnerId, draftVisitId, [])
      return () => { mounted = false }
    }
    void readSiteVisitDraftFiles(draftOwnerId, draftVisitId).then((restoredFiles) => {
      if (!mounted) return
      setFiles(restoredFiles)
      setFilesLoaded(true)
    })
    return () => { mounted = false }
  }, [draftOwnerId, draftVisitId, restoredDraft])

  useEffect(() => {
    if (!filesLoaded) return
    void saveSiteVisitDraftFiles(draftOwnerId, draftVisitId, files)
  }, [draftOwnerId, draftVisitId, files, filesLoaded])

  useEffect(() => {
    function flushDraft() {
      if (draftRef.current) saveSiteVisitEntryDraft(draftOwnerId, draftVisitId, draftRef.current)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushDraft()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushDraft)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushDraft)
    }
  }, [draftOwnerId, draftVisitId])

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length === 0) return
    setFiles((current) => {
      const combined = [...current, ...selected]
      if (combined.length > 5) setError('Maksimum 5 gambar bagi satu catatan.')
      const next = combined.slice(0, 5)
      void saveSiteVisitDraftFiles(draftOwnerId, draftVisitId, next)
      return next
    })
  }

  function removeDraftFile(index: number) {
    setFiles((current) => {
      const next = current.filter((_, fileIndex) => fileIndex !== index)
      void saveSiteVisitDraftFiles(draftOwnerId, draftVisitId, next)
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!form.note_text.trim()) { setError('Catatan bebas mesti diisi.'); return }
    if (!areas.some((area) => String(area.id) === form.area_id)) { setError('Pilih kawasan kerja yang sah.'); return }
    try {
      await onSubmit({ ...form, measurement_text: showMeasurement ? form.measurement_text : '', guide_key: showGuides ? form.guide_key : '' }, files)
      await clearSiteVisitEntryDraft(draftOwnerId, draftVisitId)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Catatan tidak dapat disimpan.')
    }
  }

  return (
    <DialogFrame title={entry ? 'Ubah catatan' : 'Tambah catatan'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800">{restoredDraft ? 'Draf catatan dipulihkan. ' : ''}Disimpan automatik pada peranti{draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}` : ''}.</p>

        <label className="block"><span className="field-label">Kawasan kerja</span><select value={form.area_id} onChange={(event) => setForm((current) => ({ ...current, area_id: event.target.value }))} className="field-control">{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>

        <label className="block">
          <span className="field-label">Catatan bebas <span className="text-red-600">*</span></span>
          <textarea autoFocus value={form.note_text} onChange={(event) => setForm((current) => ({ ...current, note_text: event.target.value }))} className="field-control min-h-32 resize-y" placeholder="Contoh: Porch nak buat lantai imprint 10 x 10" />
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">Tulis seperti dalam buku nota. Tidak perlu pilih unit atau masukkan harga.</span>
        </label>

        <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 ${form.needs_confirmation ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-slate-200 bg-white text-slate-700'}`}>
          <input type="checkbox" checked={form.needs_confirmation} onChange={(event) => setForm((current) => ({ ...current, needs_confirmation: event.target.checked }))} className="h-5 w-5 accent-orange-600" />
          <span><span className="block text-xs font-black">Perlu Pengesahan</span><span className="mt-0.5 block text-[11px] leading-4 opacity-75">Tanda perkara yang perlu disahkan kemudian. Ia tidak menghalang sebutharga.</span></span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowMeasurement((current) => !current)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black ${showMeasurement ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600'}`}><Ruler className="h-4 w-4" />Ukuran</button>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-900"><Camera className="h-4 w-4" />Ambil Gambar<input aria-label="Ambil gambar dengan kamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={addFiles} /></label>
          <label className="col-span-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"><Images className="h-4 w-4" />Pilih dari Galeri<input aria-label="Pilih gambar dari galeri" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addFiles} /></label>
        </div>

        {showMeasurement && <label className="block"><span className="field-label">Ukuran ringkas</span><input value={form.measurement_text} onChange={(event) => setForm((current) => ({ ...current, measurement_text: event.target.value }))} className="field-control" placeholder="Contoh: 10 x 10, paras siap 4 inci" /><span className="mt-1.5 block text-xs text-slate-500">Unit tidak wajib; catat cara yang paling cepat.</span></label>}
        {files.length > 0 && <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-700">{files.length} gambar disimpan dalam draf</p><ul className="mt-2 space-y-1 text-xs text-slate-500">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" onClick={() => removeDraftFile(index)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500" aria-label={`Buang ${file.name}`}><X className="h-3.5 w-3.5" /></button></li>)}</ul></div>}

        <button type="button" onClick={() => setShowGuides((current) => !current)} className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3.5 text-left text-xs font-black ${showGuides ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`}><span className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />Panduan butiran kerja <span className="font-medium">(pilihan)</span></span><ChevronDown className="h-4 w-4" /></button>

        {showGuides && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setForm((current) => ({ ...current, guide_key: '' }))} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold ${!form.guide_key ? 'bg-slate-950 text-white' : 'border border-amber-200 bg-white text-slate-600'}`}>Tiada</button>
              {guides.filter((guide) => guide.is_active).map((guide) => <button key={guide.guide_key} type="button" onClick={() => setForm((current) => ({ ...current, guide_key: guide.guide_key }))} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold ${form.guide_key === guide.guide_key ? 'bg-slate-950 text-white' : 'border border-amber-200 bg-white text-slate-600'}`}>{guide.name_ms}</button>)}
            </div>
            {selectedGuide && <div><p className="text-xs font-bold leading-5 text-amber-900">{selectedGuide.description_ms}</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-amber-950">{guidePrompts(selectedGuide.prompts_ms).map((prompt) => <li key={prompt} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{prompt}</li>)}</ul><p className="mt-3 text-[11px] font-semibold text-amber-800">Panduan ini hanya mengingatkan. Ia tidak menambah item atau harga secara automatik.</p></div>}
          </div>
        )}

        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60">{saving ? 'Menyimpan...' : entry ? 'Simpan Perubahan' : 'Simpan Catatan'}</button>
      </form>
    </DialogFrame>
  )
}

function DialogFrame({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`safe-bottom max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Tutup"><X className="h-5 w-5" /></button></div>
        {children}
      </section>
    </div>
  )
}
