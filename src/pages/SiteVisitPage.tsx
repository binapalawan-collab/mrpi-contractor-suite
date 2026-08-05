import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardPenLine,
  MapPin,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { VisitSetupForm } from '../components/site-visits/VisitSetupForm'
import { VisitWorkspace } from '../components/site-visits/VisitWorkspace'
import {
  buildSitePhotoPath,
  emptyVisitForm,
  formatVisitDate,
  normalizePhone,
  nullableTrimmed,
  siteVisitPhotoBucket,
  validateSitePhoto,
  visitFormFromRows,
  visitStatusLabel,
  type Client,
  type EntryFormValue,
  type SiteVisit,
  type SiteVisitArea,
  type SiteVisitEntry,
  type SiteVisitGuide,
  type SiteVisitPhoto,
  type VisitFormValue,
} from '../lib/siteVisit'
import {
  clearSiteVisitResume,
  readSiteVisitResume,
  saveSiteVisitResume,
} from '../lib/siteVisitDrafts'
import { supabase } from '../lib/supabase'

type PageMode = 'list' | 'setup' | 'workspace'
type VisitWorkflowStatus = 'draft' | 'completed' | 'ready_for_quote'

export function SiteVisitPage() {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [guides, setGuides] = useState<SiteVisitGuide[]>([])
  const [areas, setAreas] = useState<SiteVisitArea[]>([])
  const [entries, setEntries] = useState<SiteVisitEntry[]>([])
  const [photos, setPhotos] = useState<SiteVisitPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Map<number, string>>(new Map())
  const [activeVisit, setActiveVisit] = useState<SiteVisit | null>(null)
  const [setupVisit, setSetupVisit] = useState<SiteVisit | null>(null)
  const [mode, setMode] = useState<PageMode>('list')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadPage() {
      setLoading(true)
      setError('')

      const { data: company, error: companyError } = await client
        .from('companies')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()

      if (!mounted) return
      if (companyError) {
        setError(companyError.message)
        setLoading(false)
        return
      }
      if (!company) {
        setLoading(false)
        return
      }

      setCompanyId(company.id)
      const [clientResult, visitResult, guideResult] = await Promise.all([
        client.from('clients').select('*').eq('company_id', company.id).order('name').order('id'),
        client.from('site_visits').select('*').eq('company_id', company.id).order('visit_date', { ascending: false }).order('id', { ascending: false }),
        client.from('system_site_visit_guides').select('*').eq('is_active', true).order('sort_order').order('guide_key'),
      ])

      if (!mounted) return
      const firstError = clientResult.error ?? visitResult.error ?? guideResult.error
      if (firstError) setError(firstError.message)
      else {
        const nextClients = clientResult.data ?? []
        const nextVisits = visitResult.data ?? []
        setClients(nextClients)
        setVisits(nextVisits)
        setGuides(guideResult.data ?? [])

        const resume = readSiteVisitResume(currentUser.id)
        if (resume?.mode === 'setup') {
          const visitToEdit = resume.visit_id === null
            ? null
            : nextVisits.find((visit) => visit.id === resume.visit_id) ?? null
          if (resume.visit_id === null || visitToEdit) {
            setSetupVisit(visitToEdit)
            setMode('setup')
          } else {
            clearSiteVisitResume(currentUser.id)
          }
        } else if (resume?.mode === 'workspace') {
          const visitToResume = nextVisits.find((visit) => visit.id === resume.visit_id)
          if (visitToResume) {
            const [areaResult, entryResult, photoResult] = await Promise.all([
              client.from('site_visit_areas').select('*').eq('company_id', company.id).eq('site_visit_id', visitToResume.id).order('sort_order').order('id'),
              client.from('site_visit_entries').select('*').eq('company_id', company.id).eq('site_visit_id', visitToResume.id).order('sort_order').order('id'),
              client.from('site_visit_photos').select('*').eq('company_id', company.id).eq('site_visit_id', visitToResume.id).order('sort_order').order('id'),
            ])
            if (!mounted) return
            const workspaceError = areaResult.error ?? entryResult.error ?? photoResult.error
            if (workspaceError) {
              setError(workspaceError.message)
            } else {
              setActiveVisit(visitToResume)
              setAreas(areaResult.data ?? [])
              setEntries(entryResult.data ?? [])
              setPhotos(photoResult.data ?? [])
              await refreshSignedUrls(photoResult.data ?? [])
              setMode('workspace')
              setNotice('Lawatan dan draf terakhir dipulihkan.')
            }
          } else {
            clearSiteVisitResume(currentUser.id)
          }
        }
      }
      setLoading(false)
    }

    void loadPage()
    return () => { mounted = false }
  }, [user])

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const activeClient = activeVisit ? clientMap.get(activeVisit.client_id) ?? null : null
  const draftCount = visits.filter((visit) => visit.status === 'draft').length
  const completedCount = visits.filter((visit) => visit.status === 'completed').length
  const readyCount = visits.filter((visit) => visit.status === 'ready_for_quote').length

  function clearMessages() {
    setError('')
    setNotice('')
  }

  async function openVisit(visit: SiteVisit) {
    if (!supabase || !companyId || !user) return
    clearMessages()
    saveSiteVisitResume(user.id, {
      mode: 'workspace',
      visit_id: visit.id,
      selected_area_id: null,
      entry_open: false,
      entry_id: null,
    })
    setBusy(true)
    setActiveVisit(visit)
    setMode('workspace')

    const [areaResult, entryResult, photoResult] = await Promise.all([
      supabase.from('site_visit_areas').select('*').eq('company_id', companyId).eq('site_visit_id', visit.id).order('sort_order').order('id'),
      supabase.from('site_visit_entries').select('*').eq('company_id', companyId).eq('site_visit_id', visit.id).order('sort_order').order('id'),
      supabase.from('site_visit_photos').select('*').eq('company_id', companyId).eq('site_visit_id', visit.id).order('sort_order').order('id'),
    ])

    const firstError = areaResult.error ?? entryResult.error ?? photoResult.error
    if (firstError) {
      setError(firstError.message)
      setAreas([])
      setEntries([])
      setPhotos([])
      setPhotoUrls(new Map())
      setBusy(false)
      return
    }

    setAreas(areaResult.data ?? [])
    setEntries(entryResult.data ?? [])
    setPhotos(photoResult.data ?? [])
    await refreshSignedUrls(photoResult.data ?? [])
    setBusy(false)
  }

  async function refreshSignedUrls(nextPhotos: SiteVisitPhoto[]) {
    if (!supabase || nextPhotos.length === 0) {
      setPhotoUrls(new Map())
      return
    }
    const { data, error: signedUrlError } = await supabase.storage
      .from(siteVisitPhotoBucket)
      .createSignedUrls(nextPhotos.map((photo) => photo.storage_path), 60 * 60)
    if (signedUrlError) {
      setError(signedUrlError.message)
      return
    }
    const pathToUrl = new Map(data.map((item) => [item.path, item.signedUrl]))
    setPhotoUrls(new Map(nextPhotos.flatMap((photo) => {
      const url = pathToUrl.get(photo.storage_path)
      return url ? [[photo.id, url] as const] : []
    })))
  }

  async function saveVisit(form: VisitFormValue) {
    if (!supabase || !user || !companyId) throw new Error('Profil syarikat belum tersedia.')
    clearMessages()
    setBusy(true)

    try {
      const phoneNormalized = normalizePhone(form.client_phone)
      const currentClient = setupVisit ? clientMap.get(setupVisit.client_id) : null
      let savedClient = clients.find((client) => client.phone_normalized === phoneNormalized) ?? null

      if (savedClient) {
        const { data, error: clientError } = await supabase
          .from('clients')
          .update({ name: form.client_name.trim(), phone: form.client_phone.trim() })
          .eq('id', savedClient.id)
          .eq('company_id', companyId)
          .select('*')
          .single()
        if (clientError) throw clientError
        savedClient = data
      } else if (currentClient) {
        const { data, error: clientError } = await supabase
          .from('clients')
          .update({ name: form.client_name.trim(), phone: form.client_phone.trim(), phone_normalized: phoneNormalized })
          .eq('id', currentClient.id)
          .eq('company_id', companyId)
          .select('*')
          .single()
        if (clientError) throw clientError
        savedClient = data
      } else {
        const { data, error: clientError } = await supabase
          .from('clients')
          .insert({ company_id: companyId, owner_user_id: user.id, name: form.client_name.trim(), phone: form.client_phone.trim(), phone_normalized: phoneNormalized })
          .select('*')
          .single()
        if (clientError) throw clientError
        savedClient = data
      }

      setClients((current) => [...current.filter((client) => client.id !== savedClient.id), savedClient].sort((a, b) => a.name.localeCompare(b.name, 'ms')))

      const visitValues = {
        client_id: savedClient.id,
        project_title: form.project_title.trim(),
        visit_date: form.visit_date,
        address_line_1: form.address_line_1.trim(),
        address_line_2: nullableTrimmed(form.address_line_2),
        postcode: nullableTrimmed(form.postcode),
        city: form.city.trim(),
        state: form.state.trim(),
        country_code: 'MY',
      }

      if (setupVisit) {
        const { data, error: visitError } = await supabase
          .from('site_visits')
          .update(visitValues)
          .eq('id', setupVisit.id)
          .eq('company_id', companyId)
          .select('*')
          .single()
        if (visitError) throw visitError
        setVisits((current) => current.map((visit) => visit.id === data.id ? data : visit))
        setActiveVisit(data)
        saveSiteVisitResume(user.id, { mode: 'workspace', visit_id: data.id, selected_area_id: null, entry_open: false, entry_id: null })
        setNotice('Maklumat lawatan berjaya dikemas kini.')
        setMode('workspace')
      } else {
        const { data, error: visitError } = await supabase
          .from('site_visits')
          .insert({ ...visitValues, company_id: companyId, owner_user_id: user.id, status: 'draft' })
          .select('*')
          .single()
        if (visitError) throw visitError
        setVisits((current) => [data, ...current])
        setActiveVisit(data)
        saveSiteVisitResume(user.id, { mode: 'workspace', visit_id: data.id, selected_area_id: null, entry_open: false, entry_id: null })
        setAreas([])
        setEntries([])
        setPhotos([])
        setPhotoUrls(new Map())
        setNotice('Lawatan baharu dimulakan. Tambah kawasan kerja pertama.')
        setMode('workspace')
      }
      setSetupVisit(null)
    } finally {
      setBusy(false)
    }
  }

  async function addArea(name: string) {
    if (!supabase || !user || !companyId || !activeVisit) throw new Error('Lawatan tidak tersedia.')
    setBusy(true)
    clearMessages()
    try {
      const sortOrder = areas.reduce((highest, area) => Math.max(highest, area.sort_order), 0) + 10
      const { data, error: areaError } = await supabase
        .from('site_visit_areas')
        .insert({ company_id: companyId, owner_user_id: user.id, site_visit_id: activeVisit.id, name: name.trim(), sort_order: sortOrder })
        .select('*')
        .single()
      if (areaError) throw areaError
      setAreas((current) => [...current, data])
      setNotice(`Kawasan “${data.name}” telah ditambah.`)
    } finally {
      setBusy(false)
    }
  }

  async function renameArea(area: SiteVisitArea, name: string) {
    if (!supabase || !companyId || !activeVisit) throw new Error('Lawatan tidak tersedia.')
    setBusy(true)
    clearMessages()
    try {
      const { data, error: areaError } = await supabase
        .from('site_visit_areas')
        .update({ name: name.trim() })
        .eq('id', area.id)
        .eq('site_visit_id', activeVisit.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (areaError) throw areaError
      setAreas((current) => current.map((currentArea) => currentArea.id === data.id ? data : currentArea))
      setNotice('Nama kawasan berjaya diubah.')
    } finally {
      setBusy(false)
    }
  }

  async function saveEntry(entry: SiteVisitEntry | null, value: EntryFormValue, files: File[]) {
    if (!supabase || !user || !companyId || !activeVisit) throw new Error('Lawatan tidak tersedia.')
    const areaId = Number(value.area_id)
    if (!areas.some((area) => area.id === areaId && area.is_active)) throw new Error('Kawasan kerja tidak sah.')
    for (const file of files) {
      const photoError = validateSitePhoto(file)
      if (photoError) throw new Error(`${file.name}: ${photoError}`)
    }

    setBusy(true)
    clearMessages()
    try {
      const entryValues = {
        area_id: areaId,
        note_text: value.note_text.trim(),
        measurement_text: nullableTrimmed(value.measurement_text),
        guide_key: nullableTrimmed(value.guide_key),
        needs_confirmation: value.needs_confirmation,
      }
      let savedEntry: SiteVisitEntry

      if (entry) {
        const { data, error: entryError } = await supabase
          .from('site_visit_entries')
          .update(entryValues)
          .eq('id', entry.id)
          .eq('site_visit_id', activeVisit.id)
          .eq('company_id', companyId)
          .select('*')
          .single()
        if (entryError) throw entryError
        savedEntry = data
        setEntries((current) => current.map((currentEntry) => currentEntry.id === data.id ? data : currentEntry))
      } else {
        const sortOrder = entries.filter((currentEntry) => currentEntry.area_id === areaId).reduce((highest, currentEntry) => Math.max(highest, currentEntry.sort_order), 0) + 10
        const { data, error: entryError } = await supabase
          .from('site_visit_entries')
          .insert({ ...entryValues, company_id: companyId, owner_user_id: user.id, site_visit_id: activeVisit.id, sort_order: sortOrder })
          .select('*')
          .single()
        if (entryError) throw entryError
        savedEntry = data
        setEntries((current) => [...current, data])
      }

      if (files.length > 0) {
        const uploadedPaths: string[] = []
        try {
          const metadata = []
          for (const [index, file] of files.entries()) {
            const storagePath = buildSitePhotoPath(user.id, activeVisit.id, savedEntry.id, file)
            const { error: uploadError } = await supabase.storage.from(siteVisitPhotoBucket).upload(storagePath, file, { cacheControl: '3600', contentType: file.type, upsert: false })
            if (uploadError) throw uploadError
            uploadedPaths.push(storagePath)
            metadata.push({ company_id: companyId, owner_user_id: user.id, site_visit_id: activeVisit.id, area_id: areaId, entry_id: savedEntry.id, storage_path: storagePath, original_filename: file.name || `gambar-${index + 1}.jpg`, mime_type: file.type, size_bytes: file.size, sort_order: index * 10 })
          }

          const { data: photoRows, error: photoInsertError } = await supabase.from('site_visit_photos').insert(metadata).select('*')
          if (photoInsertError) throw photoInsertError
          const nextPhotos = [...photos, ...photoRows]
          setPhotos(nextPhotos)
          await refreshSignedUrls(nextPhotos)
          setNotice(entry ? 'Catatan dan gambar berjaya dikemas kini.' : 'Catatan dan gambar berjaya disimpan.')
          return { entry: savedEntry, photosSaved: true as const }
        } catch (photoUploadError) {
          if (uploadedPaths.length > 0) await supabase.storage.from(siteVisitPhotoBucket).remove(uploadedPaths)
          const photoError = photoUploadError instanceof Error ? photoUploadError.message : 'ralat tidak diketahui'
          setNotice(`Catatan telah disimpan, tetapi gambar kekal dalam draf peranti: ${photoError}`)
          return { entry: savedEntry, photosSaved: false as const, photoError }
        }
      } else {
        setNotice(entry ? 'Catatan berjaya dikemas kini.' : 'Catatan berjaya disimpan.')
        return { entry: savedEntry, photosSaved: true as const }
      }
    } finally {
      setBusy(false)
    }
  }

  async function setEntryArchived(entry: SiteVisitEntry, archived: boolean) {
    if (!supabase || !companyId || !activeVisit) return
    if (archived && !window.confirm('Arkibkan catatan ini? Catatan boleh dipulihkan semula.')) return
    setBusy(true)
    clearMessages()
    try {
      const { data, error: entryError } = await supabase
        .from('site_visit_entries')
        .update({ is_active: !archived })
        .eq('id', entry.id)
        .eq('site_visit_id', activeVisit.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (entryError) throw entryError
      setEntries((current) => current.map((currentEntry) => currentEntry.id === data.id ? data : currentEntry))
      setNotice(archived ? 'Catatan telah diarkibkan.' : 'Catatan telah dipulihkan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Catatan tidak dapat dikemas kini.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(photo: SiteVisitPhoto) {
    if (!supabase || !companyId || !activeVisit) return
    if (!window.confirm('Buang gambar ini? Tindakan ini tidak boleh dipulihkan.')) return
    setBusy(true)
    clearMessages()
    try {
      const { error: rowError } = await supabase.from('site_visit_photos').delete().eq('id', photo.id).eq('company_id', companyId)
      if (rowError) throw rowError
      setPhotos((current) => current.filter((currentPhoto) => currentPhoto.id !== photo.id))
      setPhotoUrls((current) => { const next = new Map(current); next.delete(photo.id); return next })
      const { error: storageError } = await supabase.storage.from(siteVisitPhotoBucket).remove([photo.storage_path])
      if (storageError) {
        setError(`Rekod gambar telah dibuang tetapi fail storan belum dapat dibersihkan: ${storageError.message}`)
        return
      }
      setNotice('Gambar telah dibuang.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Gambar tidak dapat dibuang sepenuhnya.')
    } finally {
      setBusy(false)
    }
  }

  async function setVisitStatus(status: VisitWorkflowStatus) {
    if (!supabase || !companyId || !activeVisit) return
    if (status !== 'draft') {
      if (!entries.some((entry) => entry.is_active)) {
        setError('Tambah sekurang-kurangnya satu catatan sebelum menyiapkan lawatan.')
        return
      }
      const confirmation = status === 'completed'
        ? 'Tandakan kerja lawatan tapak ini sebagai selesai?'
        : 'Sediakan rekod lawatan ini untuk aliran Sebutharga Baru?'
      if (!window.confirm(confirmation)) return
    }
    setBusy(true)
    clearMessages()
    try {
      const { data, error: visitError } = await supabase
        .from('site_visits')
        .update({ status })
        .eq('id', activeVisit.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (visitError) throw visitError
      setActiveVisit(data)
      setVisits((current) => current.map((visit) => visit.id === data.id ? data : visit))
      const statusNotice = status === 'completed'
        ? 'Site visit selesai. Semak catatan sebelum menyediakan sebutharga.'
        : status === 'ready_for_quote'
          ? 'Lawatan sedia untuk langkah Sebutharga Baru.'
          : 'Lawatan dibuka semula sebagai draf.'
      setNotice(statusNotice)
      if (status === 'ready_for_quote') {
        clearSiteVisitResume(user!.id)
        navigate(`/sebutharga/baru?lawatan=${data.id}`)
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Status lawatan tidak dapat dikemas kini.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan Lawatan Tapak...</div>

  if (!companyId) {
    return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-black">Lengkapkan profil syarikat dahulu</h1><p className="mt-2 text-sm leading-6 text-slate-600">Lawatan Tapak memerlukan identiti syarikat untuk mengasingkan data pelanggan.</p><Link href="/profil" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Buka Profil Syarikat</Link></div>
  }

  const messagePanels = <>{error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}{notice && <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}</>

  if (mode === 'setup') {
    const setupClient = setupVisit ? clientMap.get(setupVisit.client_id) : null
    const initialValue = setupVisit && setupClient ? visitFormFromRows(setupVisit, setupClient) : emptyVisitForm()
    return <><VisitSetupForm key={setupVisit?.id ?? 'new'} initialValue={initialValue} clients={clients} editing={Boolean(setupVisit)} draftOwnerId={user!.id} draftVisitId={setupVisit?.id ?? null} onCancel={() => {
      if (setupVisit) {
        saveSiteVisitResume(user!.id, { mode: 'workspace', visit_id: setupVisit.id, selected_area_id: null, entry_open: false, entry_id: null })
        setMode('workspace')
      } else {
        clearSiteVisitResume(user!.id)
        setMode('list')
      }
      setSetupVisit(null)
    }} onSubmit={saveVisit} /></>
  }

  if (mode === 'workspace' && activeVisit && activeClient) {
    return <>{messagePanels}<VisitWorkspace visit={activeVisit} client={activeClient} areas={areas} entries={entries} photos={photos} guides={guides} photoUrls={photoUrls} busy={busy} onBack={() => { clearMessages(); clearSiteVisitResume(user!.id); setMode('list'); setActiveVisit(null) }} onEditVisit={() => { clearMessages(); saveSiteVisitResume(user!.id, { mode: 'setup', visit_id: activeVisit.id }); setSetupVisit(activeVisit); setMode('setup') }} onAddArea={addArea} onRenameArea={renameArea} onSaveEntry={saveEntry} onSetEntryArchived={setEntryArchived} onRemovePhoto={removePhoto} onSetStatus={setVisitStatus} /></>
  }

  return (
    <div className="space-y-6">
      {messagePanels}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-amber-700">Catat dahulu, lengkapkan kemudian</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Lawatan Tapak</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Catatan bebas mengikut kawasan kerja. Tiada harga dan tiada borang teknikal panjang ketika bersama pelanggan.</p>
        </div>
        <button type="button" onClick={() => { clearMessages(); saveSiteVisitResume(user!.id, { mode: 'setup', visit_id: null }); setSetupVisit(null); setMode('setup') }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 shadow-lg shadow-amber-200/60">
          <Plus className="h-5 w-5" />Lawatan Baharu
        </button>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <SummaryCard value={draftCount} label="Draf lawatan" tone="bg-amber-100 text-amber-800" />
        <SummaryCard value={completedCount} label="Site visit selesai" tone="bg-blue-100 text-blue-800" />
        <SummaryCard value={readyCount} label="Sedia untuk quote" tone="bg-emerald-100 text-emerald-800" />
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>Mode tapak:</strong> ukuran dan gambar adalah pilihan. Panduan hanya keluar apabila dipilih dan tidak mencipta item sebutharga secara automatik.</p>
      </div>

      <section>
        <div className="mb-4"><p className="text-sm font-bold text-slate-500">Rekod terkini</p><h2 className="mt-1 text-xl font-black">Semua lawatan</h2></div>
        {visits.length > 0 ? (
          <div className="space-y-3">
            {visits.map((visit) => {
              const client = clientMap.get(visit.client_id)
              const ready = visit.status === 'ready_for_quote' || visit.status === 'converted'
              return <button key={visit.id} type="button" disabled={busy} onClick={() => void openVisit(visit)} className="group flex min-h-32 w-full items-start gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md disabled:opacity-60 sm:p-5">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}><ClipboardPenLine className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{visitStatusLabel(visit.status)}</span><span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400"><CalendarDays className="h-3.5 w-3.5" />{formatVisitDate(visit.visit_date)}</span></div>
                  <p className="mt-2 truncate font-black text-slate-950">{client?.name ?? 'Pelanggan'}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{visit.project_title}</p>
                  <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-semibold text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" />{[visit.postcode, visit.city, visit.state].filter(Boolean).join(' ')}</p>
                </div>
                <ArrowRight className="mt-3 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-amber-600" />
              </button>
            })}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center"><ClipboardPenLine className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-4 font-black">Belum ada lawatan tapak</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Mulakan dengan nama pelanggan dan alamat projek. Kawasan serta catatan ditambah selepas itu.</p></div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><ClipboardPenLine className="h-5 w-5" /></div><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></article>
}
