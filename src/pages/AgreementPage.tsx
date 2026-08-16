import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileDown,
  FilePenLine,
  MessageCircle,
  ReceiptText,
  Save,
  Send,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  agreementAcceptanceLabel,
  agreementDocumentBucket,
  agreementFormFromRow,
  agreementStatusLabel,
  agreementStatusTone,
  buildAgreementDocumentPath,
  defaultAgreementForm,
  validateAgreementDocument,
  validateAgreementForm,
  type AgreementAcceptanceMethod,
  type AgreementForm,
  type ProjectAgreement,
} from '../lib/agreement'
import type { PaymentSchedule, PaymentScheduleStage } from '../lib/paymentSchedule'
import { projectAddress, type Project } from '../lib/project'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'

export function AgreementPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [agreement, setAgreement] = useState<ProjectAgreement | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null)
  const [stages, setStages] = useState<PaymentScheduleStage[]>([])
  const [form, setForm] = useState<AgreementForm>(defaultAgreementForm)
  const [acceptanceMethod, setAcceptanceMethod] = useState<AgreementAcceptanceMethod>('whatsapp')
  const [acceptanceNote, setAcceptanceNote] = useState('')
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

    async function load() {
      const { data: company, error: companyError } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [projectResult, agreementResult, scheduleResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('project_agreements').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('payment_schedules').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).maybeSingle(),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? agreementResult.error ?? scheduleResult.error
      if (loadError || !projectResult.data) {
        setError(loadError?.message ?? 'Projek tidak ditemui.')
        setLoading(false)
        return
      }
      let stageRows: PaymentScheduleStage[] = []
      if (scheduleResult.data) {
        const { data, error: stageError } = await client.from('payment_schedule_stages').select('*').eq('schedule_id', scheduleResult.data.id).order('stage_no')
        if (!mounted) return
        if (stageError) {
          setError(stageError.message)
          setLoading(false)
          return
        }
        stageRows = data ?? []
      }
      setCompanyId(company.id)
      setProject(projectResult.data)
      setAgreement(agreementResult.data)
      setSchedule(scheduleResult.data)
      setStages(stageRows)
      if (agreementResult.data) setForm(agreementFormFromRow(agreementResult.data))
      setLoading(false)
    }

    void load()
    return () => { mounted = false }
  }, [projectId, user])

  const editable = !agreement || agreement.status === 'draft'
  const firstStage = stages[0] ?? null
  const totalPercentage = useMemo(() => stages.reduce((total, stage) => total + Number(stage.percentage), 0), [stages])

  function patchForm<K extends keyof AgreementForm>(key: K, value: AgreementForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveDraft(showNotice = true) {
    if (!supabase || !project) return null
    const validationError = validateAgreementForm(form)
    if (validationError) throw new Error(validationError)
    const { data, error: saveError } = await supabase.rpc('save_project_agreement_draft', {
      p_project_id: project.id,
      p_issue_date: form.issue_date,
      p_title: form.title.trim(),
      p_work_duration_text: form.work_duration_text,
      p_client_supplied_items: form.client_supplied_items,
      p_exclusions: form.exclusions,
      p_defect_terms: form.defect_terms,
      p_additional_terms: form.additional_terms,
    })
    if (saveError) throw saveError
    setAgreement(data)
    if (showNotice) setNotice('Draf perjanjian berjaya disimpan.')
    return data
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : fallback)
    } finally { setBusy(false) }
  }

  async function issueAgreement() {
    await run(async () => {
      if (!schedule || !stages.length || Math.round(totalPercentage * 1000) / 1000 !== 100) {
        throw new Error('Simpan Jadual Pembayaran lengkap 100% sebelum mengeluarkan perjanjian.')
      }
      if (Number(schedule.basis_amount) !== Number(project.current_contract_amount)) {
        throw new Error('Nilai kontrak telah berubah. Buka dan simpan semula Jadual Pembayaran sebelum mengeluarkan perjanjian.')
      }
      const saved = await saveDraft(false)
      if (!saved || !supabase) return
      if (!window.confirm('Keluarkan perjanjian ini? Kandungan, skop dan jadual bayaran akan dibekukan sebagai snapshot.')) return
      const { data, error: issueError } = await supabase.rpc('issue_project_agreement', { p_agreement_id: saved.id })
      if (issueError) throw issueError
      setAgreement(data)
      setNotice('Perjanjian telah dikeluarkan dan snapshot dikunci.')
    }, 'Perjanjian tidak dapat dikeluarkan.')
  }

  async function startRevision() {
    if (!agreement || !supabase || !window.confirm('Mulakan revisi baharu? Versi yang telah dikeluarkan kekal dalam rekod.')) return
    await run(async () => {
      const { data, error: revisionError } = await supabase!.rpc('start_project_agreement_revision', { p_agreement_id: agreement.id })
      if (revisionError) throw revisionError
      setAgreement(data)
      setForm(agreementFormFromRow(data))
      setNotice(`Revisi ${data.revision_no} dibuka sebagai draf.`)
    }, 'Revisi tidak dapat dimulakan.')
  }

  async function uploadSignedCopy(file: File) {
    if (!agreement || !supabase || !user || !companyId || !project) return
    const validationError = validateAgreementDocument(file)
    if (validationError) { setError(validationError); return }
    await run(async () => {
      const path = buildAgreementDocumentPath(user.id, companyId, project.id, file)
      const { error: uploadError } = await supabase!.storage.from(agreementDocumentBucket).upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError
      const { data, error: attachError } = await supabase!.rpc('attach_project_agreement_signed_copy', { p_agreement_id: agreement.id, p_signed_copy_path: path })
      if (attachError) {
        await supabase!.storage.from(agreementDocumentBucket).remove([path])
        throw attachError
      }
      setAgreement(data)
      setAcceptanceMethod('uploaded')
      setNotice('Salinan perjanjian ditandatangani berjaya disimpan secara private.')
    }, 'Salinan perjanjian tidak dapat dimuat naik.')
  }

  async function acceptAgreement() {
    if (!agreement || !supabase || !window.confirm('Rekodkan perjanjian ini sebagai diterima? Rekod penerimaan tidak boleh diundur.')) return
    await run(async () => {
      const { data, error: acceptError } = await supabase!.rpc('accept_project_agreement', {
        p_agreement_id: agreement.id,
        p_acceptance_method: acceptanceMethod,
        p_acceptance_note: acceptanceNote,
      })
      if (acceptError) throw acceptError
      setAgreement(data)
      setNotice('Penerimaan pelanggan telah direkod. Pengaktifan projek masih perlu dibuat secara berasingan.')
    }, 'Penerimaan tidak dapat direkodkan.')
  }

  async function createInitialInvoice() {
    if (!agreement || !supabase) return
    await run(async () => {
      const { data, error: invoiceError } = await supabase!.rpc('create_agreement_initial_invoice', { p_agreement_id: agreement.id })
      if (invoiceError) throw invoiceError
      navigate(`/projek/${projectId}/invois/${data.id}`)
    }, 'Invois bayaran pertama tidak dapat dijana.')
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan perjanjian...</div>
  if (!project) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-black">Perjanjian tidak dapat dibuka</h1><p className="mt-2 text-sm text-red-700">{error}</p></section>

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-7">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate(`/projek/${project.id}`)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10" aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-amber-300">Kontrak projek</p><h1 className="mt-1 text-2xl font-black">Perjanjian Projek</h1><p className="mt-2 text-sm font-semibold text-slate-300">{project.project_no} · {project.client_name}</p></div>
          {agreement && <span className={`rounded-full px-3 py-1 text-[11px] font-black ${agreementStatusTone(agreement.status)}`}>{agreementStatusLabel(agreement.status)}</span>}
        </div>
        {agreement && <p className="mt-5 rounded-2xl bg-white/10 p-3 text-sm font-bold">{agreement.agreement_no} · Rev {agreement.revision_no}</p>}
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-4 sm:p-6">
        <div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-6 w-6 text-blue-700" /><div><p className="text-sm font-bold text-blue-700">Data diisi automatik</p><h2 className="mt-1 text-xl font-black text-blue-950">Pihak, tapak & nilai kontrak</h2></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Summary label="Pelanggan" value={project.client_name} /><Summary label="Nilai kontrak semasa" value={formatMoney(Number(project.current_contract_amount))} /><Summary label="Alamat projek" value={projectAddress(project)} wide /><Summary label="Sebutharga diterima" value={`${project.quotation_no} Rev ${project.quotation_revision_no}`} /></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><FilePenLine className="mt-0.5 h-6 w-6 text-amber-700" /><div><p className="text-sm font-bold text-amber-700">Terma khusus</p><h2 className="mt-1 text-xl font-black">Butiran perjanjian</h2><p className="mt-1 text-sm leading-6 text-slate-500">Skop, nilai dan jadual bayaran dijana daripada projek. Ruang ini hanya untuk terma tambahan yang benar-benar dipersetujui.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Tarikh perjanjian *"><input type="date" disabled={!editable} value={form.issue_date} onChange={(event) => patchForm('issue_date', event.target.value)} className="field-control" /></Field>
          <Field label="Tajuk *"><input disabled={!editable} value={form.title} onChange={(event) => patchForm('title', event.target.value)} className="field-control" /></Field>
          <Field label="Tempoh kerja / sasaran" wide><textarea disabled={!editable} value={form.work_duration_text} onChange={(event) => patchForm('work_duration_text', event.target.value)} placeholder="Contoh: 12 minggu dari tarikh mula yang dipersetujui." className="field-control min-h-24" /></Field>
          <Field label="Barang dibekalkan pelanggan" wide><textarea disabled={!editable} value={form.client_supplied_items} onChange={(event) => patchForm('client_supplied_items', event.target.value)} placeholder="Kosongkan jika tiada." className="field-control min-h-24" /></Field>
          <Field label="Pengecualian kerja" wide><textarea disabled={!editable} value={form.exclusions} onChange={(event) => patchForm('exclusions', event.target.value)} placeholder="Nyatakan kerja yang tidak termasuk, jika ada." className="field-control min-h-24" /></Field>
          <Field label="Kecacatan / waranti yang dipersetujui" wide><textarea disabled={!editable} value={form.defect_terms} onChange={(event) => patchForm('defect_terms', event.target.value)} placeholder="Masukkan hanya tempoh dan syarat yang telah dipersetujui." className="field-control min-h-24" /></Field>
          <Field label="Terma tambahan" wide><textarea disabled={!editable} value={form.additional_terms} onChange={(event) => patchForm('additional_terms', event.target.value)} placeholder="Terma tambahan lain, jika ada." className="field-control min-h-28" /></Field>
        </div>
      </section>

      <section className={`rounded-3xl border p-4 sm:p-6 ${schedule ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Lampiran kontrak</p><h2 className="mt-1 text-xl font-black">Jadual Pembayaran</h2><p className="mt-1 text-sm text-slate-600">Apabila dikeluarkan, jumlah setiap tahap dibekukan bersama perjanjian.</p></div><Link href={`/projek/${project.id}/jadual-bayaran`} className="flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">{schedule ? 'Semak Jadual' : 'Cipta Jadual'}</Link></div>
        {schedule ? <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-white"><div className="divide-y divide-slate-100">{stages.map((stage) => <div key={stage.id} className="grid grid-cols-[1fr_auto] gap-3 p-3 text-sm"><div><p className="font-black">{stage.stage_no}. {stage.label}</p><p className="mt-1 text-xs text-slate-500">{stage.description}</p></div><div className="text-right"><p className="font-black">{Number(stage.percentage)}%</p><p className="text-xs font-bold text-amber-700">{formatMoney(Number(stage.amount))}</p></div></div>)}</div></div> : <p className="mt-4 text-sm font-bold text-red-700">Perjanjian belum boleh dikeluarkan sehingga jadual bayaran disimpan.</p>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-black">Tindakan dokumen</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {editable && <button type="button" disabled={busy} onClick={() => void run(async () => { await saveDraft() }, 'Draf tidak dapat disimpan.')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black sm:flex-none"><Save className="h-5 w-5" />Simpan Draf</button>}
          {editable && <button type="button" disabled={busy || !schedule} onClick={() => void issueAgreement()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black disabled:opacity-50 sm:flex-none"><Send className="h-5 w-5" />Keluarkan</button>}
          {agreement && <Link href={`/projek/${project.id}/perjanjian/cetak`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white sm:flex-none"><FileDown className="h-5 w-5" />Cetak / PDF</Link>}
          {agreement?.status === 'issued' && <button type="button" disabled={busy} onClick={() => void startRevision()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-300 px-4 text-sm font-black text-blue-800 sm:flex-none"><FilePenLine className="h-5 w-5" />Buat Revisi</button>}
        </div>
      </section>

      {agreement?.status === 'issued' && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
        <div className="flex items-start gap-3"><MessageCircle className="mt-0.5 h-6 w-6 text-emerald-700" /><div><p className="text-sm font-bold text-emerald-700">Bukti persetujuan pelanggan</p><h2 className="mt-1 text-xl font-black">Rekod penerimaan</h2><p className="mt-1 text-sm leading-6 text-slate-600">Penerimaan tidak mengaktifkan projek secara automatik.</p></div></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Kaedah"><select value={acceptanceMethod} onChange={(event) => setAcceptanceMethod(event.target.value as AgreementAcceptanceMethod)} className="field-control"><option value="whatsapp">Pengesahan bertulis WhatsApp</option><option value="physical">Tandatangan fizikal</option><option value="uploaded">Salinan ditandatangani dimuat naik</option></select></Field><Field label="Catatan / rujukan"><input value={acceptanceNote} onChange={(event) => setAcceptanceNote(event.target.value)} placeholder="Tarikh, nama atau rujukan mesej" className="field-control" /></Field></div>
        <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-black text-emerald-800 sm:w-fit"><Upload className="h-5 w-5" />Muat Naik Salinan Ditandatangani<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSignedCopy(file); event.currentTarget.value = '' }} /></label>
        {agreement.signed_copy_path && <p className="mt-3 text-xs font-bold text-emerald-800">Salinan private telah dilampirkan.</p>}
        <button type="button" disabled={busy || (acceptanceMethod === 'uploaded' && !agreement.signed_copy_path)} onClick={() => void acceptAgreement()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto"><CheckCircle2 className="h-5 w-5" />Rekod Sebagai Diterima</button>
      </section>}

      {agreement?.status === 'accepted' && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6"><div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-6 w-6 text-emerald-700" /><div><p className="text-sm font-bold text-emerald-700">Perjanjian diterima</p><h2 className="mt-1 text-xl font-black">{agreementAcceptanceLabel(agreement.acceptance_method)}</h2><p className="mt-1 text-sm text-slate-600">{agreement.acceptance_note || 'Tiada catatan tambahan.'}</p></div></div><button type="button" disabled={busy} onClick={() => void createInitialInvoice()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white sm:w-auto"><ReceiptText className="h-5 w-5" />{agreement.initial_invoice_id ? 'Buka Invois Bayaran Pertama' : `Jana Invois Bayaran Pertama${firstStage ? ` · ${formatMoney(Number(firstStage.amount))}` : ''}`}</button></section>}
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`block ${wide ? 'sm:col-span-2' : ''}`}><span className="field-label">{label}</span>{children}</label>
}

function Summary({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-2xl bg-white p-4 ${wide ? 'sm:col-span-2' : ''}`}><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black leading-6 text-slate-800">{value}</p></div>
}
