import {
  CalendarCheck,
  HandCoins,
  History,
  LockKeyhole,
  Pencil,
  Trash2,
  Undo2,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadAdvances, loadAttendance, loadProjects, loadWagePayments, loadWorkers } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { attendanceLabel, formatDate, formatMoney, paymentMethods } from '../lib/workforce'
import type { Attendance, Project, WagePayment, Worker, WorkerAdvance } from '../types/domain'

type Tab = 'payments' | 'advances' | 'attendance'

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>('payments')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [payments, setPayments] = useState<WagePayment[]>([])
  const [attendanceToDelete, setAttendanceToDelete] = useState<Attendance | null>(null)
  const [wageToReverse, setWageToReverse] = useState<WagePayment | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function refresh() {
    setLoading(true)
    setError('')
    Promise.all([loadWorkers(), loadProjects(), loadAttendance(), loadAdvances(), loadWagePayments()])
      .then(([loadedWorkers, loadedProjects, loadedAttendance, loadedAdvances, loadedPayments]) => {
        setWorkers(loadedWorkers)
        setProjects(loadedProjects)
        setAttendance(loadedAttendance)
        setAdvances(loadedAdvances)
        setPayments(loadedPayments)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const workerMap = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  async function deleteAttendance() {
    if (!supabase || !attendanceToDelete) return
    setBusy(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.rpc('delete_unpaid_worker_attendance', {
        p_attendance_id: attendanceToDelete.id,
      })
      if (deleteError) throw deleteError
      setAttendanceToDelete(null)
      refresh()
    } catch (reason) {
      setError(errorMessage(reason))
      setAttendanceToDelete(null)
    } finally {
      setBusy(false)
    }
  }

  async function reverseWagePayment() {
    if (!supabase || !wageToReverse) return
    setBusy(true)
    setError('')
    try {
      const { data, error: reverseError } = await supabase.rpc('reverse_worker_wage_payment', {
        p_wage_payment_id: wageToReverse.id,
      })
      if (reverseError) throw reverseError
      const storagePaths = Array.isArray(data)
        ? data.filter((path): path is string => typeof path === 'string' && path.length > 0)
        : []
      if (storagePaths.length) await supabase.storage.from('expense-receipts').remove(storagePaths)
      setWageToReverse(null)
      refresh()
    } catch (reason) {
      setError(errorMessage(reason))
      setWageToReverse(null)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingBlock label="Memuatkan sejarah workforce..." />

  return <>
    <PageHeader
      eyebrow="Semak & betulkan"
      title="Sejarah workforce"
      description="Edit atau padam attendance yang tersalah. Rekod berbayar perlu dibatalkan dahulu."
    />
    {error && <div className="mb-5"><ErrorBlock message={error} retry={refresh} /></div>}

    <div className="mb-5 grid grid-cols-3 rounded-2xl bg-slate-200/70 p-1">
      <TabButton active={tab === 'payments'} onClick={() => setTab('payments')} icon={WalletCards} label="Upah" />
      <TabButton active={tab === 'advances'} onClick={() => setTab('advances')} icon={HandCoins} label="Advance" />
      <TabButton active={tab === 'attendance'} onClick={() => setTab('attendance')} icon={CalendarCheck} label="Attendance" />
    </div>

    {tab === 'payments' && (payments.length
      ? <div className="space-y-3">{payments.map((payment) => <article key={payment.id} className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-700">{projectMap.get(payment.project_id)?.project_no}</p>
            <h2 className="mt-1 font-black">{workerMap.get(payment.worker_id)?.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{formatDate(payment.period_start)}–{formatDate(payment.period_end)} · Dibayar {formatDate(payment.payment_date)}</p>
            <p className="mt-1 text-xs text-slate-400">{paymentMethods.find((method) => method.value === payment.payment_method)?.label}</p>
          </div>
          <div className="text-right"><p className="font-black text-sky-700">{formatMoney(payment.net_amount)}</p><p className="mt-1 text-xs text-slate-500">Kasar {formatMoney(payment.gross_amount)}</p>{payment.advance_deduction > 0 && <p className="mt-1 text-xs font-bold text-amber-700">Tolak {formatMoney(payment.advance_deduction)}</p>}</div>
        </div>
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black text-rose-700 hover:bg-rose-50" onClick={() => setWageToReverse(payment)}><Undo2 className="h-4 w-4" />Batalkan bayaran</button>
        </div>
      </article>)}</div>
      : <EmptyBlock title="Belum ada bayaran upah" description="Bayaran yang disahkan akan muncul di sini." />)}

    {tab === 'advances' && (advances.length
      ? <div className="space-y-3">{advances.map((advance) => <article key={advance.id} className="card flex items-start justify-between gap-4 p-5">
        <div><p className="text-xs font-black text-sky-700">{projectMap.get(advance.project_id)?.project_no}</p><h2 className="mt-1 font-black">{workerMap.get(advance.worker_id)?.name}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(advance.advance_date)} · {advance.applied_wage_payment_id ? 'Sudah ditolak' : 'Belum ditolak'}</p></div>
        <p className="font-black text-amber-700">{formatMoney(advance.amount)}</p>
      </article>)}</div>
      : <EmptyBlock title="Belum ada pendahuluan" description="Pendahuluan pekerja akan muncul di sini." />)}

    {tab === 'attendance' && (attendance.length
      ? <div className="card divide-y divide-slate-100 overflow-hidden">{attendance.slice(0, 150).map((record) => {
        const paid = Boolean(record.wage_payment_id)
        return <div key={record.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-black">{workerMap.get(record.worker_id)?.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{formatDate(record.attendance_date)} · {record.project_id ? projectMap.get(record.project_id)?.project_no : 'Tiada projek'} · {attendanceLabel(record.status)}</p>
            </div>
            <div className="text-right"><p className="font-black">{formatMoney(record.wage_amount)}</p>{paid && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"><LockKeyhole className="h-3 w-3" />Dikunci</span>}</div>
          </div>
          {paid
            ? <p className="mt-3 text-[11px] font-semibold text-slate-400">Batalkan bayaran upah berkaitan sebelum membetulkan attendance ini.</p>
            : <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Link href={`/attendance?date=${encodeURIComponent(record.attendance_date)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black text-sky-700 hover:bg-sky-50"><Pencil className="h-3.5 w-3.5" />Edit</Link>
              <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black text-rose-700 hover:bg-rose-50" onClick={() => setAttendanceToDelete(record)}><Trash2 className="h-3.5 w-3.5" />Padam</button>
            </div>}
        </div>
      })}</div>
      : <EmptyBlock title="Belum ada attendance" description="Attendance harian akan muncul di sini." />)}

    {attendanceToDelete && <ConfirmDialog
      title="Padam rekod attendance?"
      description={`${workerMap.get(attendanceToDelete.worker_id)?.name ?? 'Pekerja'} pada ${formatDate(attendanceToDelete.attendance_date)} akan kembali kepada status Belum ditanda.`}
      confirmLabel="Padam attendance"
      busy={busy}
      onCancel={() => setAttendanceToDelete(null)}
      onConfirm={() => void deleteAttendance()}
    />}
    {wageToReverse && <ConfirmDialog
      title="Batalkan bayaran upah?"
      description="Rekod expenses upah akan dibuang, attendance dalam tempoh ini dibuka semula untuk pembetulan, dan pendahuluan berkaitan akan dikembalikan kepada belum ditolak. Selepas membetulkan attendance, rekodkan bayaran upah semula."
      confirmLabel="Batalkan bayaran"
      busy={busy}
      onCancel={() => setWageToReverse(null)}
      onConfirm={() => void reverseWagePayment()}
    />}
  </>
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof History; label: string }) {
  return <button onClick={onClick} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-black ${active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}><Icon className="h-4 w-4" />{label}</button>
}
