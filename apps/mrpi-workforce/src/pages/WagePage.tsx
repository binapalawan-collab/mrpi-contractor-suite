import {
  Banknote,
  CircleAlert,
  HandCoins,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadAdvances, loadAttendance, loadProjects, loadWorkers } from '../lib/queries'
import { supabase } from '../lib/supabase'
import {
  formatDate,
  formatMoney,
  localDateISO,
  monthStart,
  outstandingAttendanceWage,
  payTypeLabel,
  paymentMethods,
} from '../lib/workforce'
import type { Attendance, PaymentMethod, Project, Worker, WorkerAdvance } from '../types/domain'

type WageGroup = {
  worker: Worker
  project: Project
  rows: Attendance[]
  outstanding: number
  start: string
  end: string
}

type WorkerWageSummary = {
  worker: Worker
  groups: WageGroup[]
  workDays: number
  outstanding: number
  advances: number
  netPay: number
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function workUnits(row: Attendance) {
  if (row.status === 'half_day') return 0.5
  return row.status === 'present' ? 1 : 0
}

function formatDays(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hari`
}

function projectOptionLabel(project: Project) {
  return project.workforce_name ? project.project_no : `${project.project_no} · ${project.project_name}`
}

export function WagePage() {
  const today = localDateISO()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [periodStart, setPeriodStart] = useState(monthStart(today))
  const [periodEnd, setPeriodEnd] = useState(today)
  const [grossInput, setGrossInput] = useState('')
  const [cashInput, setCashInput] = useState('')
  const [selectedAdvances, setSelectedAdvances] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [loadedWorkers, loadedProjects, loadedAttendance, loadedAdvances] = await Promise.all([
        loadWorkers(true),
        loadProjects(),
        loadAttendance(),
        loadAdvances(true),
      ])
      setWorkers(loadedWorkers)
      setProjects(loadedProjects)
      setAttendance(loadedAttendance)
      setAdvances(loadedAdvances)
      setWorkerId((current) => loadedWorkers.some((worker) => String(worker.id) === current)
        ? current
        : String(loadedWorkers[0]?.id ?? ''))
      setProjectId((current) => loadedProjects.some((project) => String(project.id) === current)
        ? current
        : String(loadedProjects[0]?.id ?? ''))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groups = useMemo(() => {
    const workerMap = new Map(workers.map((worker) => [worker.id, worker]))
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    const groupedRows = new Map<string, Attendance[]>()

    for (const row of attendance) {
      if (!row.project_id || row.status === 'absent') continue
      if (outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) <= 0) continue
      const key = `${row.worker_id}:${row.project_id}`
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row])
    }

    return [...groupedRows.entries()].flatMap(([key, rows]) => {
      const [workerRaw, projectRaw] = key.split(':')
      const worker = workerMap.get(Number(workerRaw))
      const project = projectMap.get(Number(projectRaw))
      if (!worker || !project) return []
      const dates = rows.map((row) => row.attendance_date).sort()
      return [{
        worker,
        project,
        rows,
        outstanding: roundMoney(rows.reduce(
          (sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount),
          0,
        )),
        start: dates[0]!,
        end: dates.at(-1)!,
      }]
    })
  }, [attendance, projects, workers])

  const workerSummaries = useMemo(() => workers.flatMap((worker) => {
    const workerGroups = groups.filter((group) => group.worker.id === worker.id)
    if (!workerGroups.length) return []
    const rows = workerGroups.flatMap((group) => group.rows)
    const outstanding = roundMoney(workerGroups.reduce((sum, group) => sum + group.outstanding, 0))
    const openAdvances = roundMoney(advances
      .filter((advance) => advance.worker_id === worker.id)
      .reduce((sum, advance) => sum + advance.amount, 0))
    return [{
      worker,
      groups: workerGroups,
      workDays: rows.reduce((sum, row) => sum + workUnits(row), 0),
      outstanding,
      advances: openAdvances,
      netPay: roundMoney(Math.max(0, outstanding - openAdvances)),
    } satisfies WorkerWageSummary]
  }), [advances, groups, workers])

  const selectedWorker = workers.find((worker) => worker.id === Number(workerId))
  const eligibleAdvances = advances.filter((advance) => (
    advance.worker_id === Number(workerId) && advance.project_id === Number(projectId)
  ))
  const deduction = roundMoney(eligibleAdvances
    .filter((advance) => selectedAdvances.includes(advance.id))
    .reduce((sum, advance) => sum + advance.amount, 0))
  const matchingRows = attendance.filter((row) => (
    row.worker_id === Number(workerId)
    && row.project_id === Number(projectId)
    && row.status !== 'absent'
    && row.attendance_date >= periodStart
    && row.attendance_date <= periodEnd
    && outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) > 0
  ))
  const outstandingTotal = roundMoney(matchingRows.reduce(
    (sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount),
    0,
  ))
  const contractGross = roundMoney(Number(grossInput || 0))
  const cashAmount = selectedWorker?.pay_type === 'daily'
    ? roundMoney(Number(cashInput || 0))
    : roundMoney(Math.max(0, contractGross - deduction))
  const settlementTotal = selectedWorker?.pay_type === 'daily'
    ? roundMoney(cashAmount + deduction)
    : contractGross
  const balanceAfterPayment = selectedWorker?.pay_type === 'daily'
    ? roundMoney(Math.max(0, outstandingTotal - settlementTotal))
    : 0
  const availableForPayment = selectedWorker?.pay_type === 'daily' ? outstandingTotal : contractGross

  useEffect(() => {
    if (!payOpen || selectedWorker?.pay_type !== 'daily') return
    setCashInput(Math.max(0, roundMoney(outstandingTotal - deduction)).toFixed(2))
  }, [deduction, outstandingTotal, payOpen, selectedWorker?.pay_type])

  let paymentError = ''
  if (!selectedWorker || !projectId) paymentError = 'Pilih pekerja dan projek.'
  else if (selectedWorker.pay_type === 'daily' && outstandingTotal <= 0) {
    paymentError = 'Tiada baki upah attendance dalam tempoh ini atau kadar hari masih RM0.'
  } else if (selectedWorker.pay_type === 'contract' && contractGross <= 0) {
    paymentError = 'Masukkan upah kontrak untuk bayaran ini.'
  } else if (deduction > availableForPayment) {
    paymentError = 'Pinjaman dipilih melebihi jumlah upah untuk bayaran ini.'
  } else if (cashAmount < 0 || settlementTotal <= 0) {
    paymentError = 'Jumlah bayaran mesti melebihi RM0.'
  } else if (selectedWorker.pay_type === 'daily' && settlementTotal > outstandingTotal) {
    paymentError = 'Tunai dan pinjaman melebihi baki upah.'
  }

  function resetSelectedAdvances() {
    setSelectedAdvances([])
  }

  function setGroupForPayment(group: WageGroup) {
    setWorkerId(String(group.worker.id))
    setProjectId(String(group.project.id))
    setPeriodStart(group.start)
    setPeriodEnd(group.end)
  }

  function openWorkerPayment(summary: WorkerWageSummary) {
    const nextGroup = summary.groups[0]
    if (!nextGroup) return
    setGroupForPayment(nextGroup)
    setGrossInput('')
    setCashInput('')
    resetSelectedAdvances()
    setPayOpen(true)
  }

  function openPayment() {
    const worker = workers.find((item) => String(item.id) === workerId) ?? workers[0]
    const group = worker ? groups.find((item) => item.worker.id === worker.id) : undefined
    if (group) setGroupForPayment(group)
    setGrossInput('')
    setCashInput('')
    resetSelectedAdvances()
    setPayOpen(true)
  }

  function selectWorker(value: string) {
    setWorkerId(value)
    const group = groups.find((item) => item.worker.id === Number(value))
    if (group) {
      setProjectId(String(group.project.id))
      setPeriodStart(group.start)
      setPeriodEnd(group.end)
    }
    resetSelectedAdvances()
  }

  function selectProject(value: string) {
    setProjectId(value)
    const group = groups.find((item) => item.worker.id === Number(workerId) && item.project.id === Number(value))
    if (group) {
      setPeriodStart(group.start)
      setPeriodEnd(group.end)
    }
    resetSelectedAdvances()
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedWorker || paymentError) return
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const { error: paymentRequestError } = await supabase.rpc('record_worker_wage_payment_partial', {
        p_worker_id: Number(workerId),
        p_project_id: Number(projectId),
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_payment_date: String(form.get('payment_date')),
        p_gross_amount: selectedWorker.pay_type === 'contract' ? contractGross : null,
        p_cash_amount: selectedWorker.pay_type === 'daily' ? cashAmount : null,
        p_advance_ids: selectedAdvances,
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })
      if (paymentRequestError) throw paymentRequestError
      setPayOpen(false)
      resetSelectedAdvances()
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function recordAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { error: advanceError } = await supabase.rpc('record_worker_advance', {
        p_worker_id: Number(form.get('worker_id')),
        p_project_id: Number(form.get('project_id')),
        p_advance_date: String(form.get('advance_date')),
        p_amount: Number(form.get('amount')),
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })
      if (advanceError) throw advanceError
      setAdvanceOpen(false)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock label="Mengira baki upah..." />

  return <>
    <PageHeader
      eyebrow="Bayaran pekerja"
      title="Upah & pinjaman"
      description="Ringkas: hari kerja, hutang upah, pinjaman dan jumlah bersih yang perlu dibayar."
      action={<div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setAdvanceOpen(true)}><HandCoins className="h-4 w-4" />Pinjaman</button>
        <button className="btn-primary" onClick={openPayment}><Plus className="h-4 w-4" />Bayar upah</button>
      </div>}
    />

    {error && <div className="mb-5"><ErrorBlock message={error} retry={() => void refresh()} /></div>}

    {advanceOpen && <Modal title="Rekod pinjaman" close={() => setAdvanceOpen(false)}>
      <form onSubmit={recordAdvance} className="space-y-4">
        <WorkerProjectFields workers={workers} projects={projects} />
        <label><span className="field-label">Tarikh</span><input name="advance_date" type="date" className="field-control" required defaultValue={today} /></label>
        <label><span className="field-label">Amaun</span><input name="amount" type="number" min="0.01" step="0.01" className="field-control" required /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue="cash">{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" /></label>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan pinjaman'}</button>
      </form>
    </Modal>}

    {payOpen && <Modal title="Rekod bayaran upah" close={() => setPayOpen(false)}>
      <form onSubmit={pay} className="space-y-4">
        <label>
          <span className="field-label">Pekerja</span>
          <select className="field-control" value={workerId} onChange={(event) => selectWorker(event.target.value)}>
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {payTypeLabel(worker.pay_type)}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Projek</span>
          <select className="field-control" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">Dari</span><input type="date" className="field-control" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label><span className="field-label">Hingga</span><input type="date" className="field-control" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
        </div>

        {selectedWorker?.pay_type === 'daily'
          ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-sky-700">Hutang upah dalam tempoh</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(outstandingTotal)}</p>
            <p className="mt-1 text-xs text-slate-500">{matchingRows.reduce((sum, row) => sum + workUnits(row), 0)} hari kerja berbaki.</p>
          </div>
          : <label>
            <span className="field-label">Upah kontrak untuk bayaran ini</span>
            <input type="number" min="0.01" step="0.01" required className="field-control" value={grossInput} onChange={(event) => setGrossInput(event.target.value)} />
          </label>}

        {eligibleAdvances.length > 0 && <fieldset>
          <legend className="field-label">Pinjaman untuk ditolak</legend>
          <div className="space-y-2">{eligibleAdvances.map((advance) => {
            const selected = selectedAdvances.includes(advance.id)
            const exceedsPayment = !selected && roundMoney(deduction + advance.amount) > availableForPayment
            return <label key={advance.id} className={`flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm ${exceedsPayment ? 'opacity-45' : ''}`}>
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={exceedsPayment}
                  onChange={(event) => setSelectedAdvances((ids) => event.target.checked
                    ? [...ids, advance.id]
                    : ids.filter((id) => id !== advance.id))}
                  className="h-5 w-5 accent-sky-600"
                />
                {formatDate(advance.advance_date)}
              </span>
              <strong>{formatMoney(advance.amount)}</strong>
            </label>
          })}</div>
        </fieldset>}

        {selectedWorker?.pay_type === 'daily' && <label>
          <span className="field-label">Tunai dibayar sekarang</span>
          <input
            type="number"
            min="0"
            max={Math.max(0, outstandingTotal - deduction)}
            step="0.01"
            required
            className="field-control text-lg font-black"
            value={cashInput}
            onChange={(event) => setCashInput(event.target.value)}
          />
          <span className="mt-1 block text-[11px] text-slate-500">Boleh bayar sebahagian. Baki akan kekal sebagai hutang upah.</span>
        </label>}

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex justify-between text-sm"><span>Hutang upah</span><strong>{formatMoney(selectedWorker?.pay_type === 'daily' ? outstandingTotal : contractGross)}</strong></div>
          <div className="mt-2 flex justify-between text-sm text-amber-700"><span>Tolak pinjaman</span><strong>{formatMoney(deduction)}</strong></div>
          <div className="mt-2 flex justify-between text-sm"><span>Tunai dibayar</span><strong className="text-sky-700">{formatMoney(cashAmount)}</strong></div>
          {selectedWorker?.pay_type === 'daily' && <div className="mt-3 flex justify-between border-t border-slate-200 pt-3"><span className="font-black">Baki selepas bayaran</span><strong className={balanceAfterPayment > 0 ? 'text-rose-600' : 'text-emerald-700'}>{formatMoney(balanceAfterPayment)}</strong></div>}
        </div>

        <label><span className="field-label">Tarikh bayar</span><input name="payment_date" type="date" className="field-control" required defaultValue={today} /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue={'cash' satisfies PaymentMethod}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" /></label>

        {paymentError && <p className="alert-error flex gap-2"><CircleAlert className="h-5 w-5 shrink-0" />{paymentError}</p>}
        <button className="btn-primary w-full" disabled={saving || Boolean(paymentError)}>{saving ? 'Merekod...' : balanceAfterPayment > 0 ? 'Sahkan bayaran separa' : 'Sahkan bayaran upah'}</button>
      </form>
    </Modal>}

    <div className="space-y-3">
      {workerSummaries.map((summary) => <article key={summary.worker.id} className="card p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-black">{summary.worker.name}</h2>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-4 xl:max-w-3xl">
            <SimpleMetric label="Tempoh kerja" value={formatDays(summary.workDays)} />
            <SimpleMetric label="Hutang upah" value={formatMoney(summary.outstanding)} />
            <SimpleMetric label="Pinjaman" value={formatMoney(summary.advances)} tone="amber" />
            <SimpleMetric label="Bersih" value={formatMoney(summary.netPay)} tone="sky" strong />
          </div>
          <button onClick={() => openWorkerPayment(summary)} className="btn-primary shrink-0"><Banknote className="h-4 w-4" />Bayar</button>
        </div>
      </article>)}
      {!workerSummaries.length && <EmptyBlock title="Tiada hutang upah" description="Pekerja kontrak masih boleh dibayar menggunakan butang Bayar upah." />}
    </div>
  </>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-6">
    <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        <button type="button" onClick={close} className="h-10 rounded-xl px-3 text-sm font-black text-slate-500 hover:bg-slate-100">Tutup</button>
      </div>
      {children}
    </div>
  </div>
}

function WorkerProjectFields({ workers, projects }: { workers: Worker[]; projects: Project[] }) {
  return <>
    <label><span className="field-label">Pekerja</span><select name="worker_id" className="field-control" required>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
    <label><span className="field-label">Projek</span><select name="project_id" className="field-control" required>{projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}</select></label>
  </>
}

function SimpleMetric({ label, value, tone = 'slate', strong = false }: { label: string; value: string; tone?: 'slate' | 'amber' | 'sky'; strong?: boolean }) {
  const valueClass = tone === 'amber' ? 'text-amber-700' : tone === 'sky' ? 'text-sky-700' : 'text-slate-950'
  return <div className="rounded-xl bg-slate-50 px-3 py-3">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 ${strong ? 'text-xl' : 'text-base'} font-black ${valueClass}`}>{value}</p>
  </div>
}
