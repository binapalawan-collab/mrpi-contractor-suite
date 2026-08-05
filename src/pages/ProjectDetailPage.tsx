import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderKanban,
  LockKeyhole,
  MapPin,
  Phone,
  Save,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  formatMoney,
  formatQuotationNumber,
} from '../lib/quotation'
import {
  formatProjectDate,
  nextProjectStatus,
  projectAddress,
  projectStatusActionLabel,
  projectStatusLabel,
  projectStatusTone,
  type Project,
  type ProjectItem,
  type ProjectSection,
} from '../lib/project'
import { supabase } from '../lib/supabase'

const workflow = ['preparation', 'scheduled', 'active', 'work_completed', 'handed_over'] as const

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [items, setItems] = useState<ProjectItem[]>([])
  const [projectName, setProjectName] = useState('')
  const [plannedStartDate, setPlannedStartDate] = useState('')
  const [plannedEndDate, setPlannedEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) {
      setError('ID projek tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadProject() {
      setLoading(true)
      setError('')
      const { data: company, error: companyError } = await client
        .from('companies')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      setCompanyId(company.id)

      const [projectResult, sectionResult, itemResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('project_sections').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('project_items').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? sectionResult.error ?? itemResult.error
      if (loadError || !projectResult.data) {
        setError(loadError?.message ?? 'Projek tidak ditemui.')
        setLoading(false)
        return
      }

      setProject(projectResult.data)
      setSections(sectionResult.data ?? [])
      setItems(itemResult.data ?? [])
      setProjectName(projectResult.data.project_name)
      setPlannedStartDate(projectResult.data.planned_start_date ?? '')
      setPlannedEndDate(projectResult.data.planned_end_date ?? '')
      setLoading(false)
    }

    void loadProject()
    return () => { mounted = false }
  }, [projectId, user])

  const groupedItems = useMemo(() => {
    const map = new Map<number, ProjectItem[]>()
    for (const item of items) map.set(item.section_id, [...(map.get(item.section_id) ?? []), item])
    return map
  }, [items])

  async function saveOperations() {
    if (!supabase || !project || !companyId) return
    const trimmedName = projectName.trim()
    if (!trimmedName) {
      setError('Nama projek mesti diisi.')
      return
    }
    if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
      setError('Tarikh siap sasaran tidak boleh lebih awal daripada tarikh mula.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: updateError } = await supabase
        .from('projects')
        .update({
          project_name: trimmedName,
          planned_start_date: plannedStartDate || null,
          planned_end_date: plannedEndDate || null,
        })
        .eq('id', project.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (updateError) throw updateError
      setProject(data)
      setProjectName(data.project_name)
      setPlannedStartDate(data.planned_start_date ?? '')
      setPlannedEndDate(data.planned_end_date ?? '')
      setNotice('Maklumat operasi projek berjaya disimpan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Projek tidak dapat dikemas kini.')
    } finally {
      setBusy(false)
    }
  }

  async function advanceStatus() {
    if (!supabase || !project || !companyId) return
    const nextStatus = nextProjectStatus(project.status)
    const actionLabel = projectStatusActionLabel(project.status)
    if (!nextStatus || !actionLabel) return
    if (!window.confirm(`${actionLabel}? Status mesti bergerak mengikut urutan dan tidak boleh diundur.`)) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: updateError } = await supabase
        .from('projects')
        .update({ status: nextStatus })
        .eq('id', project.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (updateError) throw updateError
      setProject(data)
      setNotice(`Status projek kini ${projectStatusLabel(data.status)}.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Status projek tidak dapat dikemas kini.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan projek...</div>

  if (!project) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><FolderKanban className="h-8 w-8 text-red-700" /><h1 className="mt-4 text-xl font-black">Projek tidak dapat dibuka</h1>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}<button type="button" onClick={() => navigate('/projek')} className="mt-4 min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Kembali ke Projek</button></section>

  const currentStep = workflow.indexOf(project.status as typeof workflow[number])
  const actionLabel = projectStatusActionLabel(project.status)

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('/projek')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${projectStatusTone(project.status)}`}>{projectStatusLabel(project.status)}</span><h1 className="mt-3 text-2xl font-black tracking-tight">{project.project_no}</h1><p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-300">{project.project_name}</p></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3.5"><p className="text-xs font-bold text-slate-400">Pelanggan</p><p className="mt-1 truncate font-black">{project.client_name}</p></div><div className="rounded-2xl bg-white/10 p-3.5 text-right"><p className="text-xs font-bold text-slate-400">Nilai kontrak</p><p className="mt-1 text-lg font-black text-amber-300">{formatMoney(Number(project.contract_amount))}</p></div></div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><p className="text-sm font-bold text-amber-700">Maklumat operasi</p><h2 className="mt-1 text-xl font-black">Perancangan projek</h2><p className="mt-1 text-sm leading-6 text-slate-500">Nama operasi dan tarikh perancangan boleh dikemas kini. Skop serta nilai kontrak asal kekal dikunci.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="field-label">Nama projek *</span><textarea value={projectName} onChange={(event) => setProjectName(event.target.value)} className="field-control min-h-24" /></label>
          <label className="block"><span className="field-label">Tarikh mula dirancang</span><input type="date" value={plannedStartDate} onChange={(event) => setPlannedStartDate(event.target.value)} className="field-control" /></label>
          <label className="block"><span className="field-label">Tarikh siap sasaran</span><input type="date" value={plannedEndDate} onChange={(event) => setPlannedEndDate(event.target.value)} className="field-control" /></label>
        </div>
        <button type="button" disabled={busy} onClick={() => void saveOperations()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60 sm:w-auto"><Save className="h-5 w-5" />Simpan Maklumat Projek</button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><FolderKanban className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><p className="text-sm font-bold text-amber-700">Aliran projek</p><h2 className="mt-1 text-xl font-black">Status kerja</h2><p className="mt-1 text-sm leading-6 text-slate-500">Status bergerak satu hala mengikut urutan operasi yang dipersetujui.</p></div></div>
        <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {workflow.map((status, index) => <li key={status} className={`rounded-2xl border p-3 text-xs font-black ${index <= currentStep ? 'border-amber-300 bg-amber-50 text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><span className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-white text-[11px] shadow-sm">{index + 1}</span>{projectStatusLabel(status)}</li>)}
        </ol>
        <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><p><strong className="text-slate-700">Mula sebenar:</strong> {formatProjectDate(project.actual_start_date)}</p><p><strong className="text-slate-700">Siap kerja:</strong> {formatProjectDate(project.work_completed_at)}</p><p><strong className="text-slate-700">Diserahkan:</strong> {formatProjectDate(project.handed_over_at)}</p></div>
        {actionLabel ? <button type="button" disabled={busy} onClick={() => void advanceStatus()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60 sm:w-auto"><CheckCircle2 className="h-5 w-5" />{actionLabel}</button> : <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Projek telah diserahkan.</p>}
      </section>

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-4 sm:p-6">
        <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" /><div><p className="text-sm font-bold text-blue-700">Maklumat kontrak dikunci</p><h2 className="mt-1 text-xl font-black text-blue-950">Daripada sebutharga diterima</h2><p className="mt-1 text-sm leading-6 text-blue-900">Pelanggan, alamat, skop dan nilai di bawah ialah baseline asal. Perubahan kemudian akan direkod sebagai Variation Order, bukan mengubah rekod ini.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info icon={<Phone />} label="Pelanggan & telefon"><p className="font-black">{project.client_name}</p><a href={`tel:${project.client_phone}`} className="mt-1 inline-block text-sm font-bold text-blue-800">{project.client_phone}</a></Info>
          <Info icon={<FileText />} label="Sebutharga asal"><Link href={`/sebutharga/${project.quotation_id}`} className="font-black text-blue-800">{formatQuotationNumber(project.quotation_no, project.quotation_revision_no)}</Link></Info>
          <Info icon={<MapPin />} label="Alamat projek" wide><p className="text-sm font-semibold leading-6">{projectAddress(project)}</p></Info>
          <Info icon={<ClipboardList />} label="Nilai kontrak" wide><p className="text-2xl font-black">{formatMoney(Number(project.contract_amount))}</p></Info>
        </div>
      </section>

      <section className="space-y-4">
        <div><p className="text-sm font-bold text-amber-700">Baseline kerja</p><h2 className="mt-1 text-xl font-black">Skop daripada sebutharga</h2><p className="mt-1 text-sm leading-6 text-slate-600">Senarai ini untuk rujukan operasi dan tidak boleh diedit di dalam projek.</p></div>
        {sections.map((section) => (
          <article key={section.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kawasan kerja</p><h3 className="mt-1 font-black">{section.name}</h3></header>
            <div className="divide-y divide-slate-100 px-4">
              {(groupedItems.get(section.id) ?? []).map((item) => <div key={item.id} className="py-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-black">{item.item_name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>{item.measurement_text && <p className="mt-1 text-xs font-semibold text-blue-700">{item.measurement_text}</p>}</div><p className="shrink-0 font-black">{formatMoney(Number(item.amount))}</p></div><p className="mt-2 text-xs font-semibold text-slate-500">{Number(item.quantity)} {item.unit} × {formatMoney(Number(item.rate))}</p></div>)}
              {!(groupedItems.get(section.id) ?? []).length && <p className="py-4 text-sm text-slate-500">Tiada item dalam kawasan ini.</p>}
            </div>
          </article>
        ))}
        {!sections.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Baseline skop tidak ditemui.</p>}
      </section>
    </div>
  )
}

function Info({ icon, label, wide, children }: { icon: React.ReactNode; label: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`rounded-2xl border border-blue-200 bg-white p-4 ${wide ? 'sm:col-span-2' : ''}`}><div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-500"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</div>{children}</article>
}
