import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  FilePlus2,
  FolderKanban,
  LockKeyhole,
  MapPin,
  PencilLine,
  Phone,
  ReceiptText,
  Save,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  formatInvoiceDate,
  invoiceStatusLabel,
  invoiceStatusTone,
  projectInvoiceTotals,
  type Invoice,
} from '../lib/invoice'
import {
  formatMoney,
  formatQuotationNumber,
} from '../lib/quotation'
import {
  formatProjectDate,
  effectiveRateForLockedAmount,
  nextProjectStatus,
  projectAddress,
  projectStatusActionLabel,
  projectStatusLabel,
  projectStatusTone,
  type Project,
  type ProjectItem,
  type ProjectSection,
  type ProjectScopeCorrection,
} from '../lib/project'
import { supabase } from '../lib/supabase'
import {
  formatSignedMoney,
  variationOrderNumber,
  variationOrderStatusLabel,
  variationOrderStatusTone,
  type VariationOrder,
} from '../lib/variationOrder'

const workflow = ['preparation', 'scheduled', 'active', 'work_completed', 'handed_over'] as const

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [items, setItems] = useState<ProjectItem[]>([])
  const [scopeCorrections, setScopeCorrections] = useState<ProjectScopeCorrection[]>([])
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null)
  const [correctionDraft, setCorrectionDraft] = useState({ itemName: '', description: '', measurementText: '', calculationMethod: 'qty', unit: '', quantity: '1', reason: '' })
  const [variationOrders, setVariationOrders] = useState<VariationOrder[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
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

      const [projectResult, sectionResult, itemResult, correctionResult, variationOrderResult, invoiceResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('project_sections').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('project_items').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('project_scope_corrections').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
        client.from('variation_orders').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).neq('status', 'archived').order('created_at').order('id'),
        client.from('invoices').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('invoice_date').order('id'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? sectionResult.error ?? itemResult.error ?? correctionResult.error ?? variationOrderResult.error ?? invoiceResult.error
      if (loadError || !projectResult.data) {
        setError(loadError?.message ?? 'Projek tidak ditemui.')
        setLoading(false)
        return
      }

      setProject(projectResult.data)
      setSections(sectionResult.data ?? [])
      setItems(itemResult.data ?? [])
      setScopeCorrections(correctionResult.data ?? [])
      setVariationOrders(variationOrderResult.data ?? [])
      setInvoices(invoiceResult.data ?? [])
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

  function openScopeCorrection(item: ProjectItem) {
    setEditingItem(item)
    setCorrectionDraft({
      itemName: item.item_name,
      description: item.description,
      measurementText: item.measurement_text ?? '',
      calculationMethod: item.calculation_method,
      unit: item.unit,
      quantity: String(Number(item.quantity)),
      reason: '',
    })
    setError('')
    setNotice('')
  }

  async function saveScopeCorrection() {
    if (!supabase || !editingItem) return
    const quantity = Number(correctionDraft.quantity)
    if (!correctionDraft.itemName.trim() || !correctionDraft.description.trim() || !correctionDraft.unit.trim()) {
      setError('Nama item, keterangan dan unit mesti diisi.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Kuantiti mesti lebih besar daripada 0.')
      return
    }
    if (!correctionDraft.reason.trim()) {
      setError('Sebab pembetulan mesti diisi untuk rekod dalaman.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: correctionError } = await supabase.rpc('correct_project_scope_item', {
        p_project_item_id: editingItem.id,
        p_item_name: correctionDraft.itemName,
        p_description: correctionDraft.description,
        p_measurement_text: correctionDraft.measurementText.trim() || null,
        p_calculation_method: correctionDraft.calculationMethod,
        p_unit: correctionDraft.unit,
        p_quantity: quantity,
        p_reason: correctionDraft.reason,
      })
      if (correctionError) throw correctionError
      setItems((current) => current.map((item) => item.id === data.id ? data : item))
      const { data: correctionRows, error: historyError } = await supabase
        .from('project_scope_corrections')
        .select('*')
        .eq('project_id', editingItem.project_id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (historyError) throw historyError
      setScopeCorrections(correctionRows ?? [])
      setEditingItem(null)
      setNotice('Butiran Skop Semasa berjaya dibetulkan. Jumlah item dan nilai kontrak kekal.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Pembetulan skop tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

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

  async function createVariationOrder() {
    if (!supabase || !project) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: createError } = await supabase.rpc('create_variation_order', { p_project_id: project.id })
      if (createError) throw createError
      navigate(`/projek/${project.id}/vo/${data.id}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Variation Order tidak dapat dicipta.')
      setBusy(false)
    }
  }

  async function createInvoice() {
    if (!supabase || !project) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: createError } = await supabase.rpc('create_project_invoice', { p_project_id: project.id })
      if (createError) throw createError
      navigate(`/projek/${project.id}/invois/${data.id}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Invois tidak dapat dicipta.')
      setBusy(false)
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan projek...</div>

  if (!project) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><FolderKanban className="h-8 w-8 text-red-700" /><h1 className="mt-4 text-xl font-black">Projek tidak dapat dibuka</h1>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}<button type="button" onClick={() => navigate('/projek')} className="mt-4 min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Kembali ke Projek</button></section>

  const currentStep = workflow.indexOf(project.status as typeof workflow[number])
  const actionLabel = projectStatusActionLabel(project.status)
  const invoiceTotals = projectInvoiceTotals(invoices)
  const remainingToBill = Math.max(0, Number(project.current_contract_amount) - invoiceTotals.billed)

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('/projek')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${projectStatusTone(project.status)}`}>{projectStatusLabel(project.status)}</span><h1 className="mt-3 text-2xl font-black tracking-tight">{project.project_no}</h1><p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-300">{project.project_name}</p></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3.5"><p className="text-xs font-bold text-slate-400">Pelanggan</p><p className="mt-1 truncate font-black">{project.client_name}</p></div><div className="rounded-2xl bg-white/10 p-3.5 text-right"><p className="text-xs font-bold text-slate-400">Nilai kontrak semasa</p><p className="mt-1 text-lg font-black text-amber-300">{formatMoney(Number(project.current_contract_amount))}</p></div></div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Nilai kontrak projek">
        <ContractSummary label="Kontrak asal" value={formatMoney(Number(project.contract_amount))} />
        <ContractSummary label="VO diluluskan" value={formatSignedMoney(Number(project.approved_variation_amount))} tone={Number(project.approved_variation_amount) < 0 ? 'text-red-700' : 'text-emerald-700'} />
        <ContractSummary label="Kontrak semasa" value={formatMoney(Number(project.current_contract_amount))} tone="text-amber-700" />
      </section>

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

      <section className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-start gap-3"><CalendarRange className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><p className="text-sm font-bold text-amber-700">Fungsi pilihan</p><h2 className="mt-1 text-xl font-black">Jadual Pembayaran</h2><p className="mt-1 text-sm leading-6 text-slate-600">Sediakan 4, 5, 8 tahap atau jadual manual berdasarkan nilai kontrak semasa.</p></div></div><Link href={`/projek/${project.id}/jadual-bayaran`} className="flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-black text-white">Buka / Cipta Jadual</Link></section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Tuntutan dan kutipan projek</p><h2 className="mt-1 text-xl font-black">Invois & Bayaran Progress</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Invois hanya bermula dari projek ini. Bayaran separa dan baki kekal direkod tanpa mengubah invois lama.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Link href={`/projek/${project.id}/penyata`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 sm:flex-none"><FileSpreadsheet className="h-5 w-5" />Penyata Akaun</Link><button type="button" disabled={busy || remainingToBill <= 0} onClick={() => void createInvoice()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60 sm:flex-none"><FilePlus2 className="h-5 w-5" />+ Invois Progress</button></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><ContractSummary label="Diinvois" value={formatMoney(invoiceTotals.billed)} /><ContractSummary label="Diterima" value={formatMoney(invoiceTotals.paid)} tone="text-emerald-700" /><ContractSummary label="Belum bayar" value={formatMoney(invoiceTotals.outstanding)} tone="text-amber-700" /><ContractSummary label="Belum dituntut" value={formatMoney(remainingToBill)} tone="text-blue-700" /></div>
        {invoices.length ? <div className="grid gap-3 md:grid-cols-2">{invoices.slice().reverse().map((invoice) => <Link key={invoice.id} href={`/projek/${project.id}/invois/${invoice.id}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 sm:p-5"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${invoiceStatusTone(invoice.status)}`}>{invoiceStatusLabel(invoice.status)}</span><p className="mt-3 text-lg font-black">{invoice.invoice_no}</p></div><ReceiptText className="h-6 w-6 text-slate-300" /></div><p className="mt-2 text-sm font-semibold text-slate-700">{invoice.title}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[10px] font-black text-slate-400">JUMLAH</p><p className="mt-1 font-black">{formatMoney(Number(invoice.total_amount))}</p></div><div className="text-right"><p className="text-[10px] font-black text-slate-400">BAKI</p><p className={`mt-1 font-black ${Number(invoice.balance_amount) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(Number(invoice.balance_amount))}</p></div></div><p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Banknote className="h-4 w-4" />{formatInvoiceDate(invoice.invoice_date)}</p></Link>)}</div> : <p className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center text-sm leading-6 text-slate-500">Belum ada invois untuk projek ini. Gunakan “+ Invois Progress” apabila sampai peringkat tuntutan.</p>}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Perubahan selepas kontrak</p><h2 className="mt-1 text-xl font-black">Variation Order</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Tambah, tolak atau ubah skop tanpa menimpa sebutharga dan nilai kontrak asal.</p></div><button type="button" disabled={busy} onClick={() => void createVariationOrder()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60"><FilePlus2 className="h-5 w-5" />+ Perubahan Kerja</button></div>
        {variationOrders.length ? <div className="grid gap-3 md:grid-cols-2">{variationOrders.map((variationOrder) => <Link key={variationOrder.id} href={`/projek/${project.id}/vo/${variationOrder.id}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 sm:p-5"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${variationOrderStatusTone(variationOrder.status)}`}>{variationOrderStatusLabel(variationOrder.status)}</span><p className="mt-3 text-lg font-black">{variationOrderNumber(variationOrder.vo_no, variationOrder.revision_no)}</p></div><WalletCards className="h-6 w-6 text-slate-300" /></div><p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{variationOrder.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{variationOrder.reason || 'Sebab perubahan belum diisi.'}</p><div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs font-bold text-slate-500">Kesan masa: {variationOrder.time_impact_days > 0 ? '+' : ''}{variationOrder.time_impact_days} hari</p><p className={`font-black ${Number(variationOrder.net_amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatSignedMoney(Number(variationOrder.net_amount))}</p></div></Link>)}</div> : <p className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center text-sm leading-6 text-slate-500">Belum ada Variation Order. Gunakan “+ Perubahan Kerja” hanya selepas pelanggan meminta perubahan kepada kontrak yang telah diterima.</p>}
      </section>

      <section className="space-y-4">
        <div><p className="text-sm font-bold text-amber-700">Rujukan kerja operasi</p><h2 className="mt-1 text-xl font-black">Skop Semasa Projek</h2><p className="mt-1 text-sm leading-6 text-slate-600">Betulkan ayat, ukuran, unit atau kuantiti tanpa mengubah jumlah. Sebutharga asal dan PDF pelanggan kekal seperti diterima.</p></div>
        {sections.map((section) => (
          <article key={section.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kawasan kerja</p><h3 className="mt-1 font-black">{section.name}</h3></header>
            <div className="divide-y divide-slate-100 px-4">
              {(groupedItems.get(section.id) ?? []).map((item) => <div key={item.id} className="py-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-black">{item.item_name}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{item.description}</p>{item.measurement_text && <p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-blue-700">{item.measurement_text}</p>}</div><p className="shrink-0 font-black">{formatMoney(Number(item.amount))}</p></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-500">{Number(item.quantity)} {item.unit} × kadar efektif {Number(item.rate).toFixed(6)}</p><button type="button" onClick={() => openScopeCorrection(item)} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"><PencilLine className="h-4 w-4" />Betulkan Butiran</button></div></div>)}
              {!(groupedItems.get(section.id) ?? []).length && <p className="py-4 text-sm text-slate-500">Tiada item dalam kawasan ini.</p>}
            </div>
          </article>
        ))}
        {!sections.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Baseline skop tidak ditemui.</p>}
      </section>

      {scopeCorrections.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><p className="text-sm font-bold text-amber-700">Rekod dalaman</p><h2 className="mt-1 text-xl font-black">Sejarah Pembetulan Skop</h2><div className="mt-4 space-y-3">{scopeCorrections.map((correction) => <article key={correction.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-black">{correction.reason}</p><p className="mt-1 text-xs font-semibold text-slate-500">{new Intl.DateTimeFormat('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(correction.created_at))}</p></article>)}</div></section>}

      {editingItem && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="scope-correction-title"><div className="mx-auto max-w-2xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Harga kekal</p><h2 id="scope-correction-title" className="mt-1 text-xl font-black">Betulkan Butiran Projek</h2><p className="mt-1 text-sm leading-6 text-slate-500">Jumlah item dikunci pada {formatMoney(Number(editingItem.amount))}. Ini tidak mengubah sebutharga asal.</p></div><button type="button" onClick={() => setEditingItem(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="field-label">Nama item *</span><input value={correctionDraft.itemName} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, itemName: event.target.value }))} className="field-control" /></label><label className="block sm:col-span-2"><span className="field-label">Keterangan *</span><textarea value={correctionDraft.description} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, description: event.target.value }))} className="field-control min-h-28" /></label><label className="block sm:col-span-2"><span className="field-label">Ukuran / rujukan</span><textarea value={correctionDraft.measurementText} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, measurementText: event.target.value }))} className="field-control min-h-20" /></label><label className="block"><span className="field-label">Kaedah kiraan *</span><select value={correctionDraft.calculationMethod} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, calculationMethod: event.target.value }))} className="field-control"><option value="area">Keluasan</option><option value="length">Panjang</option><option value="qty">Kuantiti</option><option value="lsum">Lump Sum</option></select></label><label className="block"><span className="field-label">Unit *</span><input value={correctionDraft.unit} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, unit: event.target.value }))} className="field-control" /></label><label className="block"><span className="field-label">Kuantiti *</span><input type="number" min="0.001" step="0.001" value={correctionDraft.quantity} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, quantity: event.target.value }))} className="field-control" /></label><div className="rounded-2xl border border-blue-200 bg-blue-50 p-3"><p className="text-xs font-bold text-blue-700">Kadar efektif baharu</p><p className="mt-1 font-black text-blue-950">{effectiveRateForLockedAmount(Number(editingItem.amount), Number(correctionDraft.quantity))?.toFixed(6) ?? '—'}</p><p className="mt-1 text-[11px] text-blue-700">Jumlah kekal {formatMoney(Number(editingItem.amount))}</p></div><label className="block sm:col-span-2"><span className="field-label">Sebab pembetulan *</span><textarea value={correctionDraft.reason} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, reason: event.target.value }))} placeholder="Contoh: Kuantiti tersalah taip semasa menyediakan sebutharga." className="field-control min-h-24" /></label></div>{error && <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setEditingItem(null)} className="min-h-12 rounded-xl border border-slate-300 px-5 text-sm font-black">Batal</button><button type="button" disabled={busy} onClick={() => void saveScopeCorrection()} className="min-h-12 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 disabled:opacity-60">{busy ? 'Menyimpan...' : 'Simpan Pembetulan'}</button></div></div></div>}
    </div>
  )
}

function Info({ icon, label, wide, children }: { icon: React.ReactNode; label: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`rounded-2xl border border-blue-200 bg-white p-4 ${wide ? 'sm:col-span-2' : ''}`}><div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-500"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</div>{children}</article>
}

function ContractSummary({ label, value, tone = 'text-slate-950' }: { label: string; value: string; tone?: string }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><p className="truncate text-[10px] font-black text-slate-500 sm:text-xs">{label}</p><p className={`mt-2 truncate text-sm font-black sm:text-lg ${tone}`}>{value}</p></article>
}
