import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Folder,
  Save,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import {
  assignWorkersToProject,
  attendanceCounts,
  estimatedDailyLabour,
  groupAttendanceRows,
  setProjectAttendanceStatus,
  type AttendanceGroup,
  type AttendanceRow,
} from '../lib/attendance'
import { errorMessage } from '../lib/errors'
import { loadAttendance, loadCompany, loadProjects, loadWorkers } from '../lib/queries'
import { supabase } from '../lib/supabase'
import {
  attendanceOptions,
  calculateDailyWage,
  formatMoney,
  localDateISO,
  payTypeLabel,
  previousDateISO,
} from '../lib/workforce'
import type { AttendanceDraft, AttendanceStatus, Company, Project, Worker } from '../types/domain'

function initialAttendanceDate() {
  const value = new URLSearchParams(window.location.search).get('date')
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateISO()
}

export function AttendancePage() {
  const { user } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [date, setDate] = useState(initialAttendanceDate)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [expandedWorkerIds, setExpandedWorkerIds] = useState<number[]>([])

  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentWorkerIds, setAssignmentWorkerIds] = useState<number[]>([])
  const [assignmentProjectId, setAssignmentProjectId] = useState('')
  const [pendingStatus, setPendingStatus] = useState<AttendanceStatus | null>(null)
  const [assignmentError, setAssignmentError] = useState('')

  const buildRows = useCallback(async (targetDate: string, currentWorkers: Worker[]) => {
    const records = await loadAttendance(targetDate)
    const attendanceByWorker = new Map(records.map((attendance) => [attendance.worker_id, attendance]))

    setRows(currentWorkers.map((worker) => {
      const attendance = attendanceByWorker.get(worker.id)
      return {
        worker,
        draft: {
          worker_id: worker.id,
          project_id: attendance?.project_id ?? null,
          status: attendance?.status ?? null,
          daily_rate_snapshot: attendance?.daily_rate_snapshot ?? worker.default_daily_rate ?? 0,
          overtime_hours: attendance?.overtime_hours ?? 0,
          overtime_rate: attendance?.overtime_rate ?? 0,
          notes: attendance?.notes ?? '',
          existing_id: attendance?.id ?? null,
          paid: (attendance?.paid_wage_amount ?? 0) > 0,
        },
      }
    }))
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadCompany(), loadWorkers(true), loadProjects()])
      .then(async ([loadedCompany, loadedWorkers, loadedProjects]) => {
        setCompany(loadedCompany)
        setWorkers(loadedWorkers)
        setProjects(loadedProjects)
        await buildRows(date, loadedWorkers)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [buildRows, date])

  const groups = useMemo(() => groupAttendanceRows(rows, projects), [projects, rows])
  const counts = useMemo(() => attendanceCounts(rows), [rows])
  const totalEstimate = useMemo(() => estimatedDailyLabour(rows), [rows])

  function changeDate(value: string) {
    setDate(value)
    setSaved(false)
    setNotice('')
    setError('')
  }

  function patchRow(workerId: number, patch: Partial<AttendanceDraft>) {
    setRows((current) => current.map((row) => row.worker.id === workerId
      ? { ...row, draft: { ...row.draft, ...patch } }
      : row))
    setSaved(false)
  }

  function openAssignment(
    workerIds: number[] = [],
    preferredProjectId?: number | null,
    status: AttendanceStatus | null = null,
  ) {
    if (!projects.length) {
      setError('Belum ada projek yang boleh dipilih dalam Contractor Suite.')
      return
    }
    setAssignmentWorkerIds(workerIds)
    setAssignmentProjectId(String(preferredProjectId ?? projects[0]?.id ?? ''))
    setPendingStatus(status)
    setAssignmentError('')
    setAssignmentOpen(true)
  }

  function applyAssignment() {
    if (!assignmentWorkerIds.length) {
      setAssignmentError('Pilih sekurang-kurangnya seorang pekerja.')
      return
    }

    const projectId = assignmentProjectId ? Number(assignmentProjectId) : null
    if (pendingStatus && !projectId) {
      setAssignmentError('Pilih projek untuk pekerja yang hadir.')
      return
    }

    setRows((current) => assignWorkersToProject(
      current,
      assignmentWorkerIds,
      projectId,
      pendingStatus,
    ))
    const project = projects.find((item) => item.id === projectId)
    setNotice(project
      ? `${assignmentWorkerIds.length} pekerja diagihkan ke ${project.project_no}.`
      : `${assignmentWorkerIds.length} pekerja dipindahkan ke Belum diagih.`)
    setSaved(false)
    setAssignmentOpen(false)
  }

  function chooseStatus(row: AttendanceRow, status: AttendanceStatus | null) {
    if (row.draft.paid) return
    if (status && status !== 'absent' && !row.draft.project_id) {
      openAssignment([row.worker.id], null, status)
      return
    }
    patchRow(row.worker.id, {
      status,
      ...(status === 'absent' ? { overtime_hours: 0 } : {}),
    })
  }

  function markProjectPresent(projectId: number) {
    setRows((current) => setProjectAttendanceStatus(current, projectId, 'present'))
    setSaved(false)
    setNotice('Semua pekerja yang boleh diubah dalam projek ini ditanda hadir.')
  }

  async function copyPreviousAssignments() {
    setCopying(true)
    setError('')
    setNotice('')
    try {
      const previous = await loadAttendance(previousDateISO(date))
      const existingProjectIds = new Set(projects.map((project) => project.id))
      const previousAssignments = new Map(previous.flatMap((attendance) => (
        attendance.project_id && existingProjectIds.has(attendance.project_id)
          ? [[attendance.worker_id, attendance.project_id] as const]
          : []
      )))
      const eligibleIds = rows
        .filter((row) => !row.draft.paid && !row.draft.existing_id && !row.draft.project_id && previousAssignments.has(row.worker.id))
        .map((row) => row.worker.id)

      if (!eligibleIds.length) {
        setNotice('Tiada pembahagian semalam yang boleh disalin untuk pekerja belum diagih.')
        return
      }

      setRows((current) => current.map((row) => {
        if (!eligibleIds.includes(row.worker.id)) return row
        return {
          ...row,
          draft: {
            ...row.draft,
            project_id: previousAssignments.get(row.worker.id) ?? null,
          },
        }
      }))
      setSaved(false)
      setNotice(`${eligibleIds.length} pembahagian pekerja disalin daripada semalam. Status masih perlu ditanda.`)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setCopying(false)
    }
  }

  async function save() {
    const client = supabase
    if (!client || !company || !user) return
    if (rows.some((row) => row.draft.status && row.draft.status !== 'absent' && !row.draft.project_id)) {
      setError('Pilih projek untuk setiap pekerja yang hadir.')
      return
    }

    setSaving(true)
    setSaved(false)
    setNotice('')
    setError('')
    try {
      const operations = rows.map(({ worker, draft }) => {
        if (draft.existing_id && draft.status === null && !draft.paid) {
          return client.from('worker_attendance').delete().eq('id', draft.existing_id)
        }
        if (!draft.status || draft.paid) return Promise.resolve({ error: null })

        const values = {
          project_id: draft.project_id,
          attendance_date: date,
          status: draft.status,
          daily_rate_snapshot: worker.pay_type === 'daily' ? draft.daily_rate_snapshot : 0,
          overtime_hours: draft.status === 'absent' ? 0 : draft.overtime_hours,
          overtime_rate: draft.overtime_rate,
          notes: draft.notes,
        }

        if (draft.existing_id) {
          return client.from('worker_attendance').update(values).eq('id', draft.existing_id)
        }
        return client.from('worker_attendance').insert({
          ...values,
          worker_id: worker.id,
          company_id: company.id,
          owner_user_id: user.id,
          pay_type_snapshot: worker.pay_type,
        })
      })

      const results = await Promise.all(operations)
      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error
      await buildRows(date, workers)
      setSaved(true)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  function toggleDetails(workerId: number) {
    setExpandedWorkerIds((current) => current.includes(workerId)
      ? current.filter((id) => id !== workerId)
      : [...current, workerId])
  }

  const unassignedWorkerIds = rows
    .filter((row) => !row.draft.project_id && !row.draft.paid)
    .map((row) => row.worker.id)

  return <>
    <PageHeader
      eyebrow="Admin check-in"
      title="Kehadiran harian"
      description="Bahagikan pekerja mengikut projek, kemudian tandakan kehadiran mereka."
      action={<button className="btn-primary" onClick={() => openAssignment()}>
        <UsersRound className="h-4 w-4" />Agihkan pekerja
      </button>}
    />

    <section className="card mb-5 p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label>
          <span className="field-label">Tarikh</span>
          <input className="field-control" type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
        </label>
        <button className="btn-secondary" type="button" onClick={() => void copyPreviousAssignments()} disabled={copying || loading}>
          <Copy className="h-4 w-4" />{copying ? 'Menyalin...' : 'Salin pembahagian semalam'}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
        <StatusPill label="Hadir" value={counts.present} className="bg-emerald-50 text-emerald-700" />
        <StatusPill label="Separuh" value={counts.half} className="bg-amber-50 text-amber-700" />
        <StatusPill label="Tidak hadir" value={counts.absent} className="bg-rose-50 text-rose-700" />
        <StatusPill label="Belum" value={counts.pending} className="bg-slate-100 text-slate-600" />
        <span className="ml-auto rounded-full bg-sky-50 px-3 py-1.5 text-sky-700">Anggaran {formatMoney(totalEstimate)}</span>
      </div>
    </section>

    {error && <div className="mb-5"><ErrorBlock message={error} /></div>}
    {saved && <p className="alert-success mb-5 flex items-center gap-2"><Check className="h-4 w-4" />Kehadiran telah disimpan.</p>}
    {notice && !saved && <p className="alert-success mb-5 flex items-center gap-2"><Check className="h-4 w-4" />{notice}</p>}

    {loading
      ? <LoadingBlock />
      : !rows.length
        ? <EmptyBlock title="Belum ada pekerja aktif" description="Tambah pekerja sebelum merekod kehadiran." />
        : <div className="space-y-5">
          {groups.map((group) => <ProjectAttendanceGroup
            key={group.key}
            group={group}
            expandedWorkerIds={expandedWorkerIds}
            onMarkAllPresent={markProjectPresent}
            onOpenAssignment={openAssignment}
            onChooseStatus={chooseStatus}
            onPatchRow={patchRow}
            onToggleDetails={toggleDetails}
          />)}

          <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur lg:bottom-4">
            <button className="btn-primary min-w-44" onClick={() => void save()} disabled={saving}>
              <Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan kehadiran'}
            </button>
          </div>
        </div>}

    {assignmentOpen && <AssignmentSheet
      rows={rows}
      projects={projects}
      selectedWorkerIds={assignmentWorkerIds}
      projectId={assignmentProjectId}
      pendingStatus={pendingStatus}
      error={assignmentError}
      unassignedWorkerIds={unassignedWorkerIds}
      onClose={() => setAssignmentOpen(false)}
      onProjectChange={setAssignmentProjectId}
      onSelectedChange={setAssignmentWorkerIds}
      onApply={applyAssignment}
    />}
  </>
}

function StatusPill({ label, value, className }: { label: string; value: number; className: string }) {
  return <span className={`rounded-full px-3 py-1.5 ${className}`}>{label} {value}</span>
}

function ProjectAttendanceGroup({
  group,
  expandedWorkerIds,
  onMarkAllPresent,
  onOpenAssignment,
  onChooseStatus,
  onPatchRow,
  onToggleDetails,
}: {
  group: AttendanceGroup
  expandedWorkerIds: number[]
  onMarkAllPresent: (projectId: number) => void
  onOpenAssignment: (workerIds?: number[], preferredProjectId?: number | null) => void
  onChooseStatus: (row: AttendanceRow, status: AttendanceStatus | null) => void
  onPatchRow: (workerId: number, patch: Partial<AttendanceDraft>) => void
  onToggleDetails: (workerId: number) => void
}) {
  const groupCounts = attendanceCounts(group.rows)
  const estimate = estimatedDailyLabour(group.rows)
  const editableRows = group.rows.filter((row) => !row.draft.paid)
  const project = group.project

  return <section className={`overflow-hidden rounded-3xl border shadow-sm ${project ? 'border-sky-200 bg-white' : 'border-slate-300 bg-slate-100/70'}`}>
    <header className={`p-4 sm:p-5 ${project ? 'bg-sky-50/80' : 'bg-slate-200/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Folder className={`h-5 w-5 shrink-0 ${project ? 'text-sky-700' : 'text-slate-500'}`} />
            <p className={`text-xs font-black uppercase tracking-wider ${project ? 'text-sky-700' : 'text-slate-500'}`}>
              {project?.project_no ?? 'Belum diagihkan'}
            </p>
          </div>
          <h2 className="mt-1 truncate text-lg font-black">{project?.project_name ?? 'Pekerja tanpa projek'}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {group.rows.length} pekerja · {groupCounts.pending} belum ditanda
            {project && ` · Anggaran ${formatMoney(estimate)}`}
          </p>
        </div>
        {project
          ? <button
            className="btn-secondary shrink-0 px-3"
            type="button"
            onClick={() => onMarkAllPresent(project.id)}
            disabled={!editableRows.length}
          >
            <Check className="h-4 w-4" /><span className="hidden sm:inline">Semua </span>hadir
          </button>
          : <button className="btn-primary shrink-0 px-3" type="button" onClick={() => onOpenAssignment(editableRows.map((row) => row.worker.id))}>
            <UsersRound className="h-4 w-4" />Agihkan
          </button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black">
        <StatusPill label="H" value={groupCounts.present} className="bg-white text-emerald-700" />
        <StatusPill label="½" value={groupCounts.half} className="bg-white text-amber-700" />
        <StatusPill label="X" value={groupCounts.absent} className="bg-white text-rose-700" />
      </div>
    </header>

    <div className="space-y-3 p-3 sm:p-4">
      {group.rows.map((row) => <WorkerAttendanceCard
        key={row.worker.id}
        row={row}
        project={project}
        expanded={expandedWorkerIds.includes(row.worker.id)}
        onOpenAssignment={onOpenAssignment}
        onChooseStatus={onChooseStatus}
        onPatchRow={onPatchRow}
        onToggleDetails={onToggleDetails}
      />)}
    </div>
  </section>
}

function WorkerAttendanceCard({
  row,
  project,
  expanded,
  onOpenAssignment,
  onChooseStatus,
  onPatchRow,
  onToggleDetails,
}: {
  row: AttendanceRow
  project: Project | null
  expanded: boolean
  onOpenAssignment: (workerIds?: number[], preferredProjectId?: number | null) => void
  onChooseStatus: (row: AttendanceRow, status: AttendanceStatus | null) => void
  onPatchRow: (workerId: number, patch: Partial<AttendanceDraft>) => void
  onToggleDetails: (workerId: number) => void
}) {
  const { worker, draft } = row
  const estimated = worker.pay_type === 'daily' && draft.status
    ? calculateDailyWage(draft.status, draft.daily_rate_snapshot, draft.overtime_hours, draft.overtime_rate)
    : 0

  return <article className={`rounded-2xl border bg-white p-4 ${draft.paid ? 'border-slate-200 bg-slate-50' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate font-black">{worker.name}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {payTypeLabel(worker.pay_type)}{draft.paid ? ' · Ada bayaran · Dikunci' : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-2">
        {worker.pay_type === 'daily' && draft.status && <div className="text-right">
          <p className="text-sm font-black text-sky-700">{formatMoney(estimated)}</p>
          <p className="text-[9px] font-semibold text-slate-400">anggaran</p>
        </div>}
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 disabled:opacity-50"
          disabled={draft.paid}
          onClick={() => onOpenAssignment([worker.id], draft.project_id)}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />{project ? 'Pindah' : 'Projek'}
        </button>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-4 gap-2">
      <button
        type="button"
        disabled={draft.paid}
        onClick={() => onChooseStatus(row, null)}
        className={`status-button ${draft.status === null ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
      >
        —<span>Belum</span>
      </button>
      {attendanceOptions.map((option) => <button
        type="button"
        key={option.value}
        disabled={draft.paid}
        onClick={() => onChooseStatus(row, option.value)}
        className={`status-button ${statusButtonClass(draft.status, option.value)}`}
      >
        <b>{option.short}</b><span>{option.label}</span>
      </button>)}
    </div>

    {draft.status && <div className="mt-3">
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between rounded-xl bg-slate-50 px-3 text-left text-xs font-bold text-slate-600"
        onClick={() => onToggleDetails(worker.id)}
      >
        <span>
          {draft.status === 'absent'
            ? (draft.notes || 'Tambah sebab tidak hadir')
            : `Kadar ${formatMoney(draft.daily_rate_snapshot)} · OT ${draft.overtime_hours} jam`}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {worker.pay_type === 'daily' && draft.status !== 'absent' && draft.daily_rate_snapshot === 0 &&
        <p className="mt-2 text-xs font-bold text-amber-700">Kadar gaji masih RM0. Buka butiran untuk kemas kini.</p>}

      {expanded && <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
        {worker.pay_type === 'daily' && draft.status !== 'absent' && <label>
          <span className="field-label">Kadar hari</span>
          <input
            className="field-control"
            type="number"
            min="0"
            step="0.01"
            disabled={draft.paid}
            value={draft.daily_rate_snapshot}
            onChange={(event) => onPatchRow(worker.id, { daily_rate_snapshot: Number(event.target.value) })}
          />
        </label>}
        {draft.status !== 'absent' && <>
          <label>
            <span className="field-label">Jam OT</span>
            <input
              className="field-control"
              type="number"
              min="0"
              max="24"
              step="0.5"
              disabled={draft.paid}
              value={draft.overtime_hours}
              onChange={(event) => onPatchRow(worker.id, { overtime_hours: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="field-label">Kadar OT / jam</span>
            <input
              className="field-control"
              type="number"
              min="0"
              step="0.01"
              disabled={draft.paid}
              value={draft.overtime_rate}
              onChange={(event) => onPatchRow(worker.id, { overtime_rate: Number(event.target.value) })}
            />
          </label>
        </>}
        <label className={draft.status === 'absent' ? '' : 'sm:col-span-3'}>
          <span className="field-label">Catatan</span>
          <input
            className="field-control"
            disabled={draft.paid}
            value={draft.notes}
            onChange={(event) => onPatchRow(worker.id, { notes: event.target.value })}
            placeholder={draft.status === 'absent' ? 'Contoh: cuti atau sakit' : 'Opsyenal'}
          />
        </label>
      </div>}
    </div>}
  </article>
}

function statusButtonClass(current: AttendanceStatus | null, option: AttendanceStatus) {
  if (current !== option) return 'border-slate-200 bg-white text-slate-600'
  if (option === 'absent') return 'border-rose-500 bg-rose-500 text-white'
  if (option === 'half_day') return 'border-amber-500 bg-amber-500 text-white'
  return 'border-emerald-600 bg-emerald-600 text-white'
}

function AssignmentSheet({
  rows,
  projects,
  selectedWorkerIds,
  projectId,
  pendingStatus,
  error,
  unassignedWorkerIds,
  onClose,
  onProjectChange,
  onSelectedChange,
  onApply,
}: {
  rows: AttendanceRow[]
  projects: Project[]
  selectedWorkerIds: number[]
  projectId: string
  pendingStatus: AttendanceStatus | null
  error: string
  unassignedWorkerIds: number[]
  onClose: () => void
  onProjectChange: (value: string) => void
  onSelectedChange: (ids: number[]) => void
  onApply: () => void
}) {
  const projectMap = new Map(projects.map((project) => [project.id, project]))

  function toggleWorker(workerId: number, selected: boolean) {
    onSelectedChange(selected
      ? [...selectedWorkerIds, workerId]
      : selectedWorkerIds.filter((id) => id !== workerId))
  }

  return <div
    className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 backdrop-blur-sm sm:place-items-center sm:p-6"
    role="presentation"
    onMouseDown={onClose}
  >
    <section
      className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Pembahagian kerja</p>
          <h2 id="assignment-title" className="mt-1 text-xl font-black">Agihkan pekerja</h2>
          <p className="mt-1 text-xs text-slate-500">Pilih nama, kemudian tentukan projek kerja.</p>
        </div>
        <button type="button" onClick={onClose} className="h-10 rounded-xl px-3 text-sm font-black text-slate-500 hover:bg-slate-100">Tutup</button>
      </div>

      {pendingStatus && <p className="mb-4 rounded-xl bg-sky-50 p-3 text-xs font-bold text-sky-800">
        Projek diperlukan sebelum pekerja ini boleh ditanda {pendingStatus === 'present' ? 'hadir' : 'separuh hari'}.
      </p>}
      {error && <p className="alert-error mb-4">{error}</p>}

      <label>
        <span className="field-label">Projek kerja</span>
        <select className="field-control" value={projectId} onChange={(event) => onProjectChange(event.target.value)}>
          {!pendingStatus && <option value="">Belum diagih / keluarkan daripada projek</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>
            {project.project_no} · {project.project_name}
          </option>)}
        </select>
      </label>

      <div className="mb-2 mt-5 flex items-center justify-between gap-3">
        <p className="field-label mb-0">Pekerja ({selectedWorkerIds.length} dipilih)</p>
        <button
          type="button"
          className="text-xs font-black text-sky-700 disabled:text-slate-400"
          disabled={!unassignedWorkerIds.length}
          onClick={() => onSelectedChange(unassignedWorkerIds)}
        >
          Pilih belum diagih
        </button>
      </div>

      <div className="max-h-[43vh] space-y-2 overflow-auto rounded-2xl bg-slate-50 p-2">
        {rows.map((row) => {
          const currentProject = row.draft.project_id ? projectMap.get(row.draft.project_id) : null
          return <label key={row.worker.id} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${row.draft.paid ? 'opacity-55' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-sky-600"
              checked={selectedWorkerIds.includes(row.worker.id)}
              disabled={row.draft.paid}
              onChange={(event) => toggleWorker(row.worker.id, event.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{row.worker.name}</strong>
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                {currentProject?.project_no ?? 'Belum diagih'}{row.draft.paid ? ' · Sudah dibayar' : ''}
              </span>
            </span>
          </label>
        })}
      </div>

      <button type="button" className="btn-primary mt-5 w-full" onClick={onApply} disabled={!selectedWorkerIds.length}>
        <ArrowRightLeft className="h-4 w-4" />Simpan pembahagian
      </button>
    </section>
  </div>
}
