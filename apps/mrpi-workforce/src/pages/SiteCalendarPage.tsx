import { ArrowLeft, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { buildReportCalendarMonths } from '../lib/reportCalendar'
import { loadAttendance, loadProjects, loadWorkers } from '../lib/queries'
import { localDateISO } from '../lib/workforce'
import type { Attendance, Project, Worker } from '../types/domain'

const dayNames = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad']

export function SiteCalendarPage({ projectId }: { projectId: string }) {
  const parsedProjectId = Number(projectId)
  const today = localDateISO()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [projects, setProjects] = useState<Project[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    Promise.all([loadProjects(), loadWorkers(), loadAttendance()])
      .then(([loadedProjects, loadedWorkers, loadedAttendance]) => {
        if (ignore) return
        setProjects(loadedProjects)
        setWorkers(loadedWorkers)
        setAttendance(loadedAttendance)
      })
      .catch((reason: unknown) => {
        if (!ignore) setError(errorMessage(reason))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => { ignore = true }
  }, [])

  const project = projects.find((item) => item.id === parsedProjectId)
  const workerMap = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers])
  const monthAttendance = useMemo(() => attendance.filter((record) => (
    record.project_id === parsedProjectId
    && record.status !== 'absent'
    && record.attendance_date.startsWith(month)
  )), [attendance, month, parsedProjectId])

  const attendanceByDate = useMemo(() => {
    const grouped = new Map<string, Attendance[]>()
    monthAttendance.forEach((record) => {
      const rows = grouped.get(record.attendance_date) ?? []
      grouped.set(record.attendance_date, [...rows, record])
    })
    grouped.forEach((rows, date) => grouped.set(date, [...rows].sort((a, b) => {
      const nameA = workerMap.get(a.worker_id)?.name ?? ''
      const nameB = workerMap.get(b.worker_id)?.name ?? ''
      return nameA.localeCompare(nameB)
    })))
    return grouped
  }, [monthAttendance, workerMap])

  const calendarMonth = useMemo(() => {
    const start = `${month}-01`
    const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    return buildReportCalendarMonths(start, end, monthAttendance.map((record) => record.attendance_date), start)[0]
  }, [month, monthAttendance])

  const uniqueWorkerCount = useMemo(() => new Set(monthAttendance.map((record) => record.worker_id)).size, [monthAttendance])
  const workerDays = useMemo(() => monthAttendance.reduce((sum, record) => sum + (record.status === 'half_day' ? 0.5 : 1), 0), [monthAttendance])

  if (loading) return <LoadingBlock label="Memuatkan kalendar tapak..." />

  if (error) return <>
    <div className="mb-5"><Link href="/projects" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Kembali</Link></div>
    <ErrorBlock message={error} />
  </>

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0 || !project || !calendarMonth) return <>
    <div className="mb-5"><Link href="/projects" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Kembali</Link></div>
    <EmptyBlock title="Tapak tidak ditemui" description="Projek ini mungkin tidak lagi tersedia dalam MRPI Workforce." />
  </>

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/projects" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Projek</Link>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary px-3" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></button>
        <input type="month" className="field-control w-auto min-w-40" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        <button type="button" className="btn-secondary px-3" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Bulan seterusnya"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>

    <section className="mb-5 grid gap-3 sm:grid-cols-2">
      <div className="card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pekerja hadir bulan ini</p>
        <p className="mt-1 text-xl font-black">{uniqueWorkerCount} orang</p>
      </div>
      <div className="card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Jumlah hari kerja</p>
        <p className="mt-1 text-xl font-black">{formatUnits(workerDays)} hari</p>
      </div>
    </section>

    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-3 items-center bg-slate-950 px-4 py-4 text-white">
        <h1 className="text-sm font-black capitalize sm:text-base">{calendarMonth.label}</h1>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-black sm:text-base">{project.project_no}</p>
          <p className="mt-0.5 hidden truncate text-[10px] font-semibold text-slate-400 sm:block">Kalendar kehadiran tapak</p>
        </div>
        <span />
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {dayNames.map((day) => <div key={day} className="px-1 py-2 text-center text-[9px] font-black uppercase tracking-wide text-slate-500 sm:text-[10px]">{day}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200">{calendarMonth.dates.map((date, index) => {
        if (!date) return <div key={`empty-${index}`} className="min-h-24 bg-slate-50 sm:min-h-36" aria-hidden="true" />
        const records = attendanceByDate.get(date) ?? []
        return <div key={date} className="min-h-24 min-w-0 bg-white p-1.5 sm:min-h-36 sm:p-2">
          <div className="flex items-start justify-between gap-1">
            <time dateTime={date} className={`grid h-6 min-w-6 place-items-center rounded-full text-[11px] font-black sm:text-xs ${date === today ? 'bg-sky-600 text-white' : 'text-slate-600'}`}>{Number(date.slice(-2))}</time>
            {records.length > 0 && <span className="hidden items-center gap-1 text-[9px] font-black text-slate-400 sm:inline-flex"><UsersRound className="h-3 w-3" />{records.length}</span>}
          </div>
          {records.length > 0 && <div className="mt-2 space-y-1">
            {records.map((record) => {
              const name = workerMap.get(record.worker_id)?.name ?? `Pekerja #${record.worker_id}`
              return <div key={record.id} className={`truncate rounded-md px-1.5 py-1 text-[8px] font-black sm:text-[10px] ${record.status === 'half_day' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`} title={`${name}${record.status === 'half_day' ? ' · ½ hari' : ' · Full day'}`}>
                {name}{record.status === 'half_day' ? ' · ½' : ''}
              </div>
            })}
          </div>}
        </div>
      })}</div>
    </article>

    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-800">Full day</span>
      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">½ day</span>
    </div>
  </>
}

function daysInMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year ?? 1970, month ?? 1, 0).getDate()
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('en-MY', { maximumFractionDigits: 1 })
}
