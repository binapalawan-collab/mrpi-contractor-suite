import { useEffect, useState, type CSSProperties } from 'react'
import { buildReportCalendarMonths } from '../lib/reportCalendar'
import {
  loadCompany,
  loadProjects,
  loadWorker,
  loadWorkerAdvances,
  loadWorkerAttendance,
  loadWorkerWagePayments,
} from '../lib/queries'
import { generateWorkerReportImage } from '../lib/workerReportImage'
import { localDateISO } from '../lib/workforce'
import { WorkerReportPage } from './WorkerReportPage'

type WorkerNameStyle = CSSProperties & { '--worker-report-name'?: string }

export function NamedWorkerReportPage({ workerId }: { workerId: string }) {
  const parsedWorkerId = Number(workerId)
  const [workerName, setWorkerName] = useState('')
  const [generatingImage, setGeneratingImage] = useState(false)

  useEffect(() => {
    let ignore = false
    if (!Number.isInteger(parsedWorkerId) || parsedWorkerId <= 0) return () => { ignore = true }
    loadWorker(parsedWorkerId)
      .then((worker) => {
        if (!ignore) setWorkerName(worker?.name ?? '')
      })
      .catch(() => {
        if (!ignore) setWorkerName('')
      })
    return () => { ignore = true }
  }, [parsedWorkerId])

  async function generateImage() {
    if (!Number.isInteger(parsedWorkerId) || parsedWorkerId <= 0 || generatingImage) return
    setGeneratingImage(true)
    try {
      const monthKey = selectedMonthKey()
      const monthStart = `${monthKey}-01`
      const monthEnd = endOfMonth(monthKey)
      const [company, worker, projects, attendance, advances, payments] = await Promise.all([
        loadCompany(),
        loadWorker(parsedWorkerId),
        loadProjects(),
        loadWorkerAttendance(parsedWorkerId, monthStart, monthEnd),
        loadWorkerAdvances(parsedWorkerId, monthStart, monthEnd),
        loadWorkerWagePayments(parsedWorkerId, monthStart, monthEnd),
      ])
      if (!worker) throw new Error('Pekerja tidak ditemui.')

      const activityDates = [
        ...attendance.map((record) => record.attendance_date),
        ...advances.map((record) => record.advance_date),
        ...payments.map((record) => record.payment_date),
      ]
      const month = buildReportCalendarMonths(monthStart, monthEnd, activityDates, monthStart)[0]
      if (!month) throw new Error('Bulan report tidak sah.')

      await generateWorkerReportImage({ company, worker, month, attendance, advances, payments, projects })
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : 'Image report tidak dapat dijana.')
    } finally {
      setGeneratingImage(false)
    }
  }

  const escapedName = workerName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const style: WorkerNameStyle = { '--worker-report-name': `"${escapedName}"` }

  return <div className="named-worker-report" style={style}>
    <button
      type="button"
      className="print-hidden btn-primary fixed bottom-5 right-5 z-50 shadow-xl sm:bottom-7 sm:right-7"
      onClick={generateImage}
      disabled={generatingImage}
    >
      {generatingImage ? 'Menjana Image...' : 'Generate Image'}
    </button>
    <WorkerReportPage workerId={workerId} />
  </div>
}

function selectedMonthKey() {
  const root = document.querySelector('.named-worker-report')
  const dates = Array.from(root?.querySelectorAll<HTMLInputElement>('input[type="date"]') ?? [])
    .map((input) => input.value)
    .filter(Boolean)
  const selected = dates.at(-1) || dates[0] || localDateISO()
  return /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected.slice(0, 7) : localDateISO().slice(0, 7)
}

function endOfMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const day = new Date(year ?? 1970, month ?? 1, 0).getDate()
  return `${monthKey}-${String(day).padStart(2, '0')}`
}
