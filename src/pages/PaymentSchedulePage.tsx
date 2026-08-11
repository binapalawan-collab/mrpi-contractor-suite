import { AlertTriangle, ArrowLeft, FileDown, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { clearPaymentScheduleLocal, loadPaymentScheduleLocal, paymentScheduleAmounts, paymentScheduleDraftFromRows, paymentScheduleDraftKey, paymentScheduleTemplate, paymentScheduleTotal, savePaymentScheduleLocal, validatePaymentSchedule, type PaymentSchedule, type PaymentScheduleDraft, type PaymentScheduleDraftStage, type PaymentScheduleTemplate } from '../lib/paymentSchedule'
import { projectAddress, type Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database, Json } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']

export function PaymentSchedulePage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null)
  const [draft, setDraft] = useState<PaymentScheduleDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false)
  const skipNextAutosave = useRef(true)

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

    async function loadSchedule() {
      const { data: companyRow, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !companyRow) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [projectResult, scheduleResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
        client.from('payment_schedules').select('*').eq('project_id', numericProjectId).eq('company_id', companyRow.id).maybeSingle(),
      ])
      if (!mounted) return
      if (projectResult.error || scheduleResult.error || !projectResult.data) {
        setError(projectResult.error?.message ?? scheduleResult.error?.message ?? 'Projek tidak ditemui.')
        setLoading(false)
        return
      }

      let serverDraft: PaymentScheduleDraft | null = null
      if (scheduleResult.data) {
        const { data: stageRows, error: stageError } = await client.from('payment_schedule_stages').select('*').eq('schedule_id', scheduleResult.data.id).eq('project_id', numericProjectId).eq('company_id', companyRow.id).order('stage_no')
        if (!mounted) return
        if (stageError) {
          setError(stageError.message)
          setLoading(false)
          return
        }
        serverDraft = paymentScheduleDraftFromRows(scheduleResult.data, stageRows ?? [])
      }

      const localKey = paymentScheduleDraftKey(currentUser.id, numericProjectId)
      const localDraft = loadPaymentScheduleLocal(localKey)
      setCompany(companyRow)
      setProject(projectResult.data)
      setSchedule(scheduleResult.data)
      setDraft(localDraft ?? serverDraft ?? blankDraft(numericProjectId))
      if (localDraft) setNotice('Draf pada peranti dipulihkan. Maklumat tidak hilang selepas tukar app atau reload.')
      setLoading(false)
      window.setTimeout(() => setReady(true), 0)
    }

    void loadSchedule()
    return () => { mounted = false }
  }, [projectId, user])

  useEffect(() => {
    if (!ready || !draft || !user) return
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return
    }
    savePaymentScheduleLocal(paymentScheduleDraftKey(user.id, draft.project_id), draft)
  }, [draft, ready, user])

  const basisAmount = Number(project?.current_contract_amount ?? 0)
  const amounts = useMemo(() => draft ? paymentScheduleAmounts(basisAmount, draft.stages) : [], [basisAmount, draft])
  const totalPercentage = draft ? paymentScheduleTotal(draft.stages) : 0
  const basisChanged = Boolean(schedule && project && Number(schedule.basis_amount) !== Number(project.current_contract_amount))

  function applyTemplate(template: PaymentScheduleTemplate) {
    if (!draft) return
    setDraft({ ...draft, stages: paymentScheduleTemplate(template) })
    setNotice(`Template ${template === 'manual' ? 'manual' : `${template} tahap`} digunakan. Semua nama, keterangan dan peratus masih boleh diubah.`)
  }

  function updateStage(localId: string, patch: Partial<PaymentScheduleDraftStage>) {
    if (!draft) return
    setDraft({ ...draft, stages: draft.stages.map((stage) => stage.local_id === localId ? { ...stage, ...patch } : stage) })
  }

  function addStage() {
    if (!draft || draft.stages.length >= 12) return
    setDraft({ ...draft, stages: [...draft.stages, { local_id: `payment-stage-${Date.now()}`, label: `Tahap ${draft.stages.length + 1}`, description: '', percentage: '' }] })
  }

  function removeStage(localId: string) {
    if (!draft || draft.stages.length <= 2) return
    setDraft({ ...draft, stages: draft.stages.filter((stage) => stage.local_id !== localId) })
  }

  async function saveSchedule() {
    if (!supabase || !user || !draft) return
    const validationError = validatePaymentSchedule(draft)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const payload = draft.stages.map(({ label, description, percentage }) => ({ label: label.trim(), description, percentage: Number(percentage.replace(',', '.')) })) as Json
    const { data: saved, error: saveError } = await supabase.rpc('save_project_payment_schedule', { p_project_id: draft.project_id, p_title: draft.title.trim(), p_notes: draft.notes, p_stages: payload })
    if (saveError || !saved) {
      setError(saveError?.message ?? 'Jadual pembayaran tidak dapat disimpan.')
      setBusy(false)
      return
    }
    const { data: stageRows, error: stageError } = await supabase.from('payment_schedule_stages').select('*').eq('schedule_id', saved.id).eq('project_id', draft.project_id).order('stage_no')
    if (stageError) setError(stageError.message)
    else {
      const refreshed = paymentScheduleDraftFromRows(saved, stageRows ?? [])
      clearPaymentScheduleLocal(paymentScheduleDraftKey(user.id, draft.project_id))
      skipNextAutosave.current = true
      setSchedule(saved)
      setDraft(refreshed)
      setNotice('Jadual pembayaran telah disimpan. Amaun dikira daripada nilai kontrak semasa.')
    }
    setBusy(false)
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan jadual pembayaran...</div>
  if (error && (!project || !company || !draft)) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div>
  if (!project || !company || !draft) return null

  return (
    <div className="print-page-wrap">
      <div className="no-print space-y-5 pb-20 lg:pb-4">
        <header className="flex items-start gap-3"><button type="button" onClick={() => navigate(`/projek/${project.id}`)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white" aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-sm font-bold text-amber-700">{project.project_no}</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Jadual Pembayaran</h1><p className="mt-2 text-sm leading-6 text-slate-600">Fungsi pilihan. Pilih template atau bina sendiri; semua peratus mesti berjumlah tepat 100%.</p></div></header>

        {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</p>}
        {basisChanged && <p className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />Nilai kontrak berubah daripada {formatMoney(Number(schedule?.basis_amount))} kepada {formatMoney(basisAmount)}, biasanya kerana VO. Semak jadual dan tekan Simpan supaya amaun baharu dikira dengan jelas.</p>}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><p className="text-sm font-bold text-amber-700">Pilih permulaan</p><h2 className="mt-1 text-xl font-black">Template jadual</h2><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{([['4', '4 tahap'], ['5', '5 tahap'], ['8', '8 tahap'], ['manual', 'Manual']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => applyTemplate(value)} className="min-h-12 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-black hover:border-amber-400 hover:bg-amber-50">{label}</button>)}</div></section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="field-label">Tajuk *</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="field-control" /></label><label className="block sm:col-span-2"><span className="field-label">Nota jadual</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="field-control" placeholder="Pilihan" /></label></div><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Nilai kontrak semasa" value={formatMoney(basisAmount)} /><Metric label="Jumlah peratus" value={`${totalPercentage.toLocaleString('ms-MY', { maximumFractionDigits: 3 })}%`} danger={totalPercentage !== 100} /></div></section>

        <section className="space-y-3"><div><p className="text-sm font-bold text-amber-700">Boleh diubah</p><h2 className="mt-1 text-xl font-black">Tahap pembayaran</h2></div>{draft.stages.map((stage, index) => <article key={stage.local_id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><GripVertical className="h-5 w-5 text-slate-300" /><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">{index + 1}</span><p className="text-sm font-black">{formatMoney(amounts[index] ?? 0)}</p></div><button type="button" disabled={draft.stages.length <= 2} onClick={() => removeStage(stage.local_id)} className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-700 disabled:opacity-30" aria-label={`Buang tahap ${index + 1}`}><Trash2 className="h-4.5 w-4.5" /></button></div><div className="mt-4 grid gap-4 sm:grid-cols-[1fr_9rem]"><label className="block"><span className="field-label">Nama tahap *</span><input value={stage.label} onChange={(event) => updateStage(stage.local_id, { label: event.target.value })} className="field-control" /></label><label className="block"><span className="field-label">Peratus *</span><div className="relative"><input inputMode="decimal" value={stage.percentage} onChange={(event) => updateStage(stage.local_id, { percentage: event.target.value })} className="field-control pr-10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-slate-400">%</span></div></label><label className="block sm:col-span-2"><span className="field-label">Pencapaian / keterangan</span><textarea value={stage.description} onChange={(event) => updateStage(stage.local_id, { description: event.target.value })} className="field-control min-h-20" /></label></div></article>)}<button type="button" disabled={draft.stages.length >= 12} onClick={addStage} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-40"><Plus className="h-5 w-5" />Tambah Tahap</button></section>

        <div className="safe-bottom sticky bottom-16 z-20 -mx-4 flex gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border"><button type="button" disabled={busy} onClick={() => void saveSchedule()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60"><Save className="h-5 w-5" />Simpan Jadual</button><button type="button" onClick={() => window.print()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"><FileDown className="h-5 w-5" /><span className="hidden sm:inline">Cetak / PDF</span></button></div>
      </div>

      <PaymentScheduleDocument company={company} project={project} draft={draft} basisAmount={basisAmount} amounts={amounts} />
    </div>
  )
}

function PaymentScheduleDocument({ company, project, draft, basisAmount, amounts }: { company: Company; project: Project; draft: PaymentScheduleDraft; basisAmount: number; amounts: number[] }) {
  const brand = (company.trading_name || company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = [company.address_line_1, company.address_line_2, [company.postcode, company.city].filter(Boolean).join(' '), company.state].filter(Boolean).join(', ')
  return <article className="print-only print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl"><header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white"><div className="flex items-start justify-between gap-6"><div><p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>{company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p>{company.phone && <p className="mt-1 text-xs text-slate-300">{company.phone}</p>}</div><div className="text-right"><p className="text-sm font-black tracking-[0.16em] text-amber-300">JADUAL PEMBAYARAN</p><p className="mt-2 text-lg font-black">{project.project_no}</p></div></div></header><div className="px-8 py-8"><section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 text-xs"><div><p className="font-black uppercase tracking-wide text-slate-400">Pelanggan</p><p className="mt-2 text-sm font-black">{project.client_name}</p><p className="mt-1 font-semibold text-slate-500">{project.client_phone}</p></div><div><p className="font-black uppercase tracking-wide text-slate-400">Projek</p><p className="mt-2 text-sm font-black">{project.project_name}</p><p className="mt-1 leading-5 text-slate-500">{projectAddress(project)}</p></div></section><section className="py-7 text-center"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">{draft.title}</p><p className="mt-3 text-3xl font-black">{formatMoney(basisAmount)}</p><p className="mt-1 text-xs font-semibold text-slate-500">Nilai kontrak semasa</p></section><table className="quotation-table w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-950 text-white"><th className="w-12 px-3 py-3 text-center">Bil.</th><th className="px-3 py-3">Tahap / Pencapaian</th><th className="w-24 px-3 py-3 text-right">Peratus</th><th className="w-32 px-3 py-3 text-right">Jumlah (RM)</th></tr></thead><tbody>{draft.stages.map((stage, index) => <tr key={stage.local_id} className="border-b border-slate-200 align-top"><td className="px-3 py-3 text-center font-bold text-slate-500">{index + 1}</td><td className="px-3 py-3"><p className="font-black">{stage.label}</p>{stage.description && <p className="mt-1 leading-5 text-slate-500">{stage.description}</p>}</td><td className="px-3 py-3 text-right font-bold">{Number(stage.percentage.replace(',', '.')).toLocaleString('ms-MY', { maximumFractionDigits: 3 })}%</td><td className="px-3 py-3 text-right font-black">{formatNumber(amounts[index] ?? 0)}</td></tr>)}</tbody><tfoot><tr className="bg-amber-50"><td colSpan={2} className="px-3 py-4 text-right font-black">JUMLAH</td><td className="px-3 py-4 text-right font-black">{paymentScheduleTotal(draft.stages).toLocaleString('ms-MY', { maximumFractionDigits: 3 })}%</td><td className="px-3 py-4 text-right text-sm font-black">{formatNumber(amounts.reduce((sum, amount) => sum + amount, 0))}</td></tr></tfoot></table>{draft.notes && <section className="mt-6 text-xs leading-5 text-slate-600"><p className="font-black text-slate-950">Nota</p><p className="mt-1 whitespace-pre-line">{draft.notes}</p></section>}<footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500"><p>Bayaran dibuat secara berperingkat berdasarkan pencapaian kerja di tapak. Kerja tambahan atau perubahan di luar skop asal direkodkan berasingan sebagai Variation Order apabila berkenaan.</p></footer></div></article>
}

function blankDraft(projectId: number): PaymentScheduleDraft { return { version: 1, project_id: projectId, title: 'JADUAL BAYARAN PROJEK', notes: '', stages: paymentScheduleTemplate('5'), saved_at: new Date().toISOString() } }
function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className={`rounded-2xl p-4 ${danger ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-900'}`}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div> }
function formatNumber(value: number) { return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
