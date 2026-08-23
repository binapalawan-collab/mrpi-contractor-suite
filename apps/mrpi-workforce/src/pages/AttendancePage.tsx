import {
  ArrowRightLeft,
  Check,
  Copy,
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
  localDateISO,
  previousDateISO,
} from '../lib/workforce'
import type { AttendanceDraft, AttendanceStatus, Company, Project, Worker } from '../types/domain'

function initialAttendanceDate() {
  const value = new URLSearchParams(window.location.search).get('date')
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateISO()
}

function projectAlias(project: Project | null | undefined) {
  return project?.workforce_name?.trim() || 'Alias belum ditetapkan'
}

function statusText(status: AttendanceStatus | null) {
  if (status === 'present') return 'Hadir'
  if (status === 'half_day') return '½ Hari'
  if (status === 'absent') return 'Tidak Hadir'
  return 'Belum ditanda'
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
      setError('Belum ada projek yang boleh dipilih.')
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
      ? `${assignmentWorkerIds.length} pekerja dipindahkan ke ${projectAlias(project)}.`
      : `${assignmentWorkerIds.length} pekerja dipindahkan ke Belum diagih.`)
    setSaved(false)
    setAssignmentOpen(false)
  }

  function chooseStatus(row: AttendanceRow, status: AttendanceStatus) {
    if (row.draft.paid) return
    if (status !== 'absent' && !row.draft.project_id) {
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
    setNotice('Semua pekerja dalam projek ini ditanda hadir.')
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
        setNotice('Tiada pembahagian semalam yang boleh disalin.')
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
      setNotice(`${eligibleIds.length} pembahagian pekerja disalin daripada semalam.`)
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

  const unassignedWorkerIds = rows
    .filter((row) => !row.draft.project_id && !row.draft.paid)
    .map((row) => row.worker.id)

  return <>
    <PageHeader
      eyebrow="Attendance"
      title="Kehadiran harian"
      description="Pilih tarikh, tandakan status dan simpan."
      action={<button className="btn-secondary" onClick={() => openAssignment()}>
        <UsersRound className="h-4 w-4" />Agihkan pekerja
      </button>}
    />

    <section className="card mb-5 p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label>
          <span className="field-label">Tarikh</span>
          <input className="field-control" type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
        </label>
        <button className="btn-secondary" type="button" onClick={() => void copyPreviousAssignments()} disabled={copying || loading}>
          <Copy className="h-4 w-4" />{copying ? 'Menyalin...' : 'Salin projek semalam'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <StatusSummary label="Hadir" value={counts.present} tone="emerald" />
        <StatusSummary label="½ Hari" value={counts.half} tone="amber" />
        <StatusSummary label="Tidak Hadir" value={counts.absent} tone="rose" />
        <StatusSummary label="Belum" value={counts.pending} tone="slate" />
      </div>
    </section>

    {error && <div className="mb-5"><ErrorBlock message={error} /></div>}
    {saved && <p className="alert-success mb-5 flex items-center gap-2"><Check className="h-4 w-4" />Attendance telah disimpan.</p>}
    {notice && !saved && <p className="alert-success mb-5 flex items-center gap-2"><Check className="h-4 w-4" />{notice}</p>}

    {loading
      ? <LoadingBlock />
      : !rows.length
        ? <EmptyBlock title="Belum ada pekerja aktif" description="Tambah pekerja sebelum merekod attendance." />
        : <div className="space-y-4 pb-24 lg:pb-20">
          {groups.map((group) => <ProjectAttendanceGroup
            key={group.key}
            group={group}
            onMarkAllPresent={markProjectPresent}
            onOpenAssignment={openAssignment}
            onChooseStatus={chooseStatus}
          />)}
        </div>}

    {!loading && rows.length > 0 && <div className="fixed inset-x-0 bottom-[72px] z-20 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgb(15_23_42/0.10)] backdrop-blur lg:bottom-0 lg:left-72">
      <div className="mx-auto max-w-6xl px-1 sm:px-6 lg:px-8">
        <button className="btn-primary w-full" onClick={() => void save()} disabled={saving}>
          <Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Attendance'}
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

function StatusSummary({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-800',
    slate: 'bg-slate-100 text-slate-700',
  }
  return <div className={`rounded-xl px-2 py-3 text-center ${styles[tone]}`}>
    <p className="text-lg font-black leading-none">{value}</p>
    <p className="mt-1 truncate text-[9px] font-black uppercase tracking-wide sm:text-[10px]">{label}</p>
  </div>
}

function ProjectAttendanceGroup({
  group,
  onMarkAllPresent,
  onOpenAssignment,
  onChooseStatus,
}: {
  group: AttendanceGroup
  onMarkAllPresent: (projectId: number) => void
  onOpenAssignment: (workerIds?: number[], preferredProjectId?: number | null) => void
  onChooseStatus: (row: AttendanceRow, status: AttendanceStatus) => void
}) {
  const groupCounts = attendanceCounts(group.rows)
  const editableRows = group.rows.filter((row) => !row.draft.paid)
  const project = group.project

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-black text-slate-950">
            {project ? projectAlias(project) : 'Belum diagihkan'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{group.rows.length} pekerja · {groupCounts.pending} belum ditanda</p>
        </div>
        {project
          ? <button
            className="btn-secondary min-h-10 shrink-0 px-3 text-xs"
            type="button"
            onClick={() => onMarkAllPresent(project.id)}
            disabled={!editableRows.length}
          >
            <Check className="h-4 w-4" />Tandakan semua hadir
          </button>
          : <button className="btn-secondary min-h-10 shrink-0 px-3 text-xs" type="button" onClick={() => onOpenAssignment(editableRows.map((row) => row.worker.id))}>
            <UsersRound className="h-4 w-4" />Agihkan
          </button>}
      </div>
    </header>

    <div className="divide-y divide-slate-100">
      {group.rows.map((row) => <WorkerAttendanceRow
        key={row.worker.id}
        row={row}
        project={project}
        onOpenAssignment={onOpenAssignment}
        onChooseStatus={onChooseStatus}
      />)}
    </div>
  </section>
}

function WorkerAttendanceRow({
  row,
  project,
  onOpenAssignment,
  onChooseStatus,
}: {
  row: AttendanceRow
  project: Project | null
  onOpenAssignment: (workerIds?: number[], preferredProjectId?: number | null) => void
  onChooseStatus: (row: AttendanceRow, status: AttendanceStatus) => void
}) {
  const { worker, draft } = row

  return <article className={`p-4 ${draft.paid ? 'bg-slate-50/80' : 'bg-white'}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate font-black text-slate-950">{worker.name}</h3>
        <p className={`mt-1 text-[11px] font-bold ${draft.status === null ? 'text-slate-400' : draft.status === 'present' ? 'text-emerald-700' : draft.status === 'half_day' ? 'text-amber-700' : 'text-rose-700'}`}>
          {statusText(draft.status)}{draft.paid ? ' · Dikunci' : ''}
        </p>
      </div>
      <button
        type="button"
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-black text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        disabled={draft.paid}
        onClick={() => onOpenAssignment([worker.id], draft.project_id)}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />{project ? 'Tukar projek' : 'Pilih projek'}
      </button>
    </div>

    <div className="grid grid-cols-3 gap-2">
      {attendanceOptions.map((option) => <button
        type="button"
        key={option.value}
        disabled={draft.paid}
        onClick={() => onChooseStatus(row, option.value)}
        className={`min-h-14 rounded-xl border px-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${statusButtonClass(draft.status, option.value)}`}
      >
        {option.value === 'half_day' ? '½ Hari' : option.label}
      </button>)}
    </div>
  </article>
}

function statusButtonClass(current: AttendanceStatus | null, option: AttendanceStatus) {
  if (current !== option) return 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  if (option === 'absent') return 'border-rose-600 bg-rose-600 text-white shadow-sm'
  if (option === 'half_day') return 'border-amber-500 bg-amber-500 text-white shadow-sm'
  return 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
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
          <p className="mt-1 text-xs text-slate-500">Pilih pekerja dan tapak kerja.</p>
        </div>
        <button type="button" onClick={onClose} className="h-10 rounded-xl px-3 text-sm font-black text-slate-500 hover:bg-slate-100">Tutup</button>
      </div>

      {pendingStatus && <p className="mb-4 rounded-xl bg-sky-50 p-3 text-xs font-bold text-sky-800">
        Pilih projek sebelum pekerja ini ditanda {pendingStatus === 'present' ? 'hadir' : '½ hari'}.
      </p>}
      {error && <p className="alert-error mb-4">{error}</p>}

      <label>
        <span className="field-label">Projek</span>
        <select className="field-control" value={projectId} onChange={(event) => onProjectChange(event.target.value)}>
          {!pendingStatus && <option value="">Belum diagih</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>
            {projectAlias(project)}
          </option>)}
        </select>
      </label>

      <div className="mb-2 mt-5 flex items-center justify-between gap-3">
        <p className="field-label mb-0">Pekerja ({selectedWorkerIds.length})</p>
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
                {currentProject ? projectAlias(currentProject) : 'Belum diagih'}{row.draft.paid ? ' · Dikunci' : ''}
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