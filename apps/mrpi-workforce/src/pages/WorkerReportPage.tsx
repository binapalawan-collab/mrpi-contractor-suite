import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  Clock3,
  HandCoins,
  Printer,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { buildReportCalendarMonths, type ReportCalendarMonth } from '../lib/reportCalendar'
import {
  loadCompany,
  loadProjects,
  loadWorker,
  loadWorkerAdvances,
  loadWorkerAttendance,
  loadWorkerBalance,
  loadWorkerWagePayments,
} from '../lib/queries'
import { buildWorkerProjectReports, buildWorkerReportTotals, type WorkerProjectReport } from '../lib/workerReport'
import {
  attendanceLabel,
  formatDate,
  formatMoney,
  localDateISO,
  monthStart,
  paymentMethods,
  payTypeLabel,
} from '../lib/workforce'
import type { Attendance, Company, Project, WagePayment, Worker, WorkerAdvance, WorkerBalance } from '../types/domain'

type CalendarPaymentSummary = {
  amount: number
  count: number
}

type CalendarAdvanceSummary = {
  amount: number
  count: number
}

export function WorkerReportPage({ workerId }: { workerId: string }) {
  const parsedWorkerId = Number(workerId)
  const today = localDateISO()
  const [fromDate, setFromDate] = useState(monthStart(today))
  const [toDate, setToDate] = useState(today)
  const [reloadKey, setReloadKey] = useState(0)
  const [company, setCompany] = useState<Company | null>(null)
  const [worker, setWorker] = useState<Worker | null>(null)
  const [balance, setBalance] = useState<WorkerBalance | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [payments, setPayments] = useState<WagePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const validWorkerId = Number.isInteger(parsedWorkerId) && parsedWorkerId > 0
  const validPeriod = !fromDate || !toDate || fromDate <= toDate

  useEffect(() => {
    let ignore = false
    if (!validWorkerId || !validPeriod) {
      setLoading(false)
      setError(!validWorkerId ? 'Pekerja tidak sah.' : 'Tarikh mula mestilah sebelum atau sama dengan tarikh akhir.')
      return () => { ignore = true }
    }

    setLoading(true)
    setError('')
    Promise.all([
      loadCompany(),
      loadWorker(parsedWorkerId),
      loadWorkerBalance(parsedWorkerId),
      loadProjects(),
      loadWorkerAttendance(parsedWorkerId, fromDate || undefined, toDate || undefined),
      loadWorkerAdvances(parsedWorkerId, fromDate || undefined, toDate || undefined),
      loadWorkerWagePayments(parsedWorkerId, fromDate || undefined, toDate || undefined),
    ])
      .then(([loadedCompany, loadedWorker, loadedBalance, loadedProjects, loadedAttendance, loadedAdvances, loadedPayments]) => {
        if (ignore) return
        setCompany(loadedCompany)
        setWorker(loadedWorker)
        setBalance(loadedBalance)
        setProjects(loadedProjects)
        setAttendance(loadedAttendance)
        setAdvances(loadedAdvances)
        setPayments(loadedPayments)
      })
      .catch((reason: unknown) => {
        if (!ignore) setError(errorMessage(reason))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => { ignore = true }
  }, [fromDate, parsedWorkerId, reloadKey, toDate, validPeriod, validWorkerId])

  const totals = useMemo(() => buildWorkerReportTotals(attendance, advances, payments), [attendance, advances, payments])
  const projectRows = useMemo(() => buildWorkerProjectReports(attendance, advances, payments), [attendance, advances, payments])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const attendanceMap = useMemo(() => new Map(attendance.map((record) => [record.attendance_date, record])), [attendance])
  const paymentMap = useMemo(() => {
    const grouped = new Map<string, CalendarPaymentSummary>()
    payments.forEach((payment) => {
      if (payment.net_amount <= 0) return
      const existing = grouped.get(payment.payment_date)
      grouped.set(payment.payment_date, {
        amount: (existing?.amount ?? 0) + payment.net_amount,
        count: (existing?.count ?? 0) + 1,
      })
    })
    return grouped
  }, [payments])
  const advanceMap = useMemo(() => {
    const grouped = new Map<string, CalendarAdvanceSummary>()
    advances.forEach((advance) => {
      if (advance.amount <= 0) return
      const existing = grouped.get(advance.advance_date)
      grouped.set(advance.advance_date, {
        amount: (existing?.amount ?? 0) + advance.amount,
        count: (existing?.count ?? 0) + 1,
      })
    })
    return grouped
  }, [advances])
  const calendarActivityDates = useMemo(
    () => [...attendance.map((record) => record.attendance_date), ...paymentMap.keys(), ...advanceMap.keys()],
    [advanceMap, attendance, paymentMap],
  )
  const calendarMonths = useMemo(
    () => buildReportCalendarMonths(fromDate, toDate, calendarActivityDates, today),
    [calendarActivityDates, fromDate, toDate, today],
  )
  const periodLabel = fromDate && toDate
    ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
    : fromDate
      ? `Mulai ${formatDate(fromDate)}`
      : toDate
        ? `Sehingga ${formatDate(toDate)}`
        : 'Semua rekod'

  if (loading) return <LoadingBlock label="Menyiapkan report pekerja..." />

  if (error) return <>
    <div className="print-hidden mb-5"><Link href="/workers" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Kembali</Link></div>
    <ErrorBlock message={error} retry={() => setReloadKey((value) => value + 1)} />
  </>

  if (!worker) return <>
    <div className="print-hidden mb-5"><Link href="/workers" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Kembali</Link></div>
    <EmptyBlock title="Pekerja tidak ditemui" description="Rekod ini mungkin telah dipadam atau anda tiada akses." />
  </>

  const dailyWorker = worker.pay_type === 'daily'

  function showThisMonth() {
    setFromDate(monthStart(today))
    setToDate(today)
  }

  function showLast30Days() {
    setFromDate(daysBefore(today, 29))
    setToDate(today)
  }

  function showAll() {
    setFromDate('')
    setToDate('')
  }

  return <div className="worker-report">
    <div className="print-hidden mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/workers" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Senarai pekerja</Link>
      <button type="button" className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />Cetak / Simpan PDF</button>
    </div>

    <header className="report-header overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-200 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-sky-300">{company?.trading_name || company?.legal_name || 'MRPI Resources'}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Report pekerja</h1>
          <p className="mt-2 text-sm text-slate-300">{periodLabel}</p>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-3 sm:text-right">
          <p className="text-xl font-black">{worker.name}</p>
          <p className="mt-1 text-xs font-bold text-slate-300">{payTypeLabel(worker.pay_type)}{dailyWorker ? ` · ${formatMoney(worker.default_daily_rate)}/hari` : ' · Upah manual'}</p>
          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${worker.is_active ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>{worker.is_active ? 'Aktif' : 'Tidak aktif'}</span>
        </div>
      </div>
    </header>

    <section className="print-hidden card mt-5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label><span className="field-label">Tarikh mula</span><input type="date" className="field-control" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label><span className="field-label">Tarikh akhir</span><input type="date" className="field-control" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={showThisMonth}>Bulan ini</button>
          <button type="button" className="btn-secondary" onClick={showLast30Days}>30 hari</button>
          <button type="button" className="btn-secondary" onClick={showAll}>Semua</button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Attendance ikut tarikh kerja. Bayaran dan advance ikut tarikh transaksi masing-masing.</p>
    </section>

    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ReportMetric icon={CalendarCheck} label="Kehadiran" value={`${formatUnits(totals.payableDays)} hari`} detail={`${totals.fullDays} penuh · ${totals.halfDays} separuh · ${totals.absentDays} tidak hadir`} tone="sky" />
      <ReportMetric icon={Clock3} label="Lebih masa" value={`${formatUnits(totals.overtimeHours)} jam`} detail={`${attendance.length} rekod attendance`} />
      {dailyWorker
        ? <>
          <ReportMetric icon={WalletCards} label="Upah terhasil" value={formatMoney(totals.earnedWages)} detail="Daripada attendance dalam tempoh" tone="emerald" />
          <ReportMetric icon={ReceiptText} label="Sudah dilangsaikan" value={formatMoney(totals.attendancePaid)} detail="Bahagian attendance yang telah dibayar" />
          <ReportMetric icon={HandCoins} label="Baki upah tempoh" value={formatMoney(totals.outstandingWages)} detail="Belum dipadankan kepada bayaran" tone={totals.outstandingWages > 0 ? 'amber' : 'emerald'} />
        </>
        : <>
          <ReportMetric icon={WalletCards} label="Bayaran kasar" value={formatMoney(totals.paymentGross)} detail={`${totals.paymentCount} rekod bayaran kontrak`} tone="emerald" />
          <ReportMetric icon={ReceiptText} label="Bayaran bersih" value={formatMoney(totals.cashPaid)} detail="Selepas tolakan advance" />
          <ReportMetric icon={HandCoins} label="Baki kontrak" value="Manual" detail="Tiada kadar harian untuk anggaran automatik" tone="amber" />
        </>}
      <ReportMetric icon={HandCoins} label="Advance dalam tempoh" value={formatMoney(totals.advancesRecorded)} detail={`${formatMoney(totals.unappliedAdvances)} belum ditolak`} />
    </section>

    <section className="report-current-balance mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.14em] text-sky-700">Kedudukan semasa · semua tarikh</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{dailyWorker ? `Upah belum dibayar ${formatMoney(balance?.unpaid_wages)} ditolak advance belum digunakan ${formatMoney(balance?.unapplied_advances)}.` : `Advance belum ditolak: ${formatMoney(balance?.unapplied_advances)}. Baki kontrak tidak dianggarkan secara automatik.`}</p>
        </div>
        <p className="text-2xl font-black text-sky-800">{dailyWorker ? formatMoney(balance?.estimated_balance) : 'Manual'}</p>
      </div>
    </section>

    {!dailyWorker && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Nota pekerja kontrak:</strong> attendance menunjukkan hari dan projek kerja, tetapi upah hanya muncul selepas bayaran kontrak direkod secara manual.</div>}

    <ReportSection icon={BriefcaseBusiness} title="Pecahan ikut projek" description="Hari kerja dan transaksi pekerja ini pada setiap projek.">
      {projectRows.length
        ? <div className="grid gap-3 lg:grid-cols-2">{projectRows.map((row) => <ProjectCard key={row.projectId} row={row} project={projectMap.get(row.projectId)} dailyWorker={dailyWorker} />)}</div>
        : <ReportEmpty text="Tiada aktiviti projek dalam tempoh ini." />}
    </ReportSection>

    <ReportSection icon={CalendarDays} title="Kalendar attendance" description="Kehadiran, cover upah, tarikh bayaran diterima dan pinjaman pekerja.">
      <AttendanceLegend />
      <div className="mt-3 space-y-4">{calendarMonths.map((month) => <AttendanceCalendar
        key={month.key}
        month={month}
        attendanceMap={attendanceMap}
        paymentMap={paymentMap}
        advanceMap={advanceMap}
        projectMap={projectMap}
        fromDate={fromDate}
        toDate={toDate}
        today={today}
      />)}</div>
    </ReportSection>

    <ReportSection icon={ReceiptText} title="Butiran attendance" description={`${attendance.length} rekod dalam tempoh dipilih.`}>
      {attendance.length
        ? <div className="report-list divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{attendance.map((record) => {
          const project = record.project_id ? projectMap.get(record.project_id) : null
          const balanceForDay = Math.max(0, record.wage_amount - record.paid_wage_amount)
          return <article key={record.id} className="report-row p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="font-black">{formatDate(record.attendance_date)}</p><StatusBadge status={record.status} /></div>
                <p className="mt-1 text-xs font-bold text-sky-700">{project ? `${project.project_no} · ${project.project_name}` : 'Tiada projek'}</p>
                {(record.overtime_hours > 0 || record.notes) && <p className="mt-2 text-xs leading-5 text-slate-500">{record.overtime_hours > 0 ? `OT ${formatUnits(record.overtime_hours)} jam${record.notes ? ' · ' : ''}` : ''}{record.notes}</p>}
              </div>
              {dailyWorker && <div className="grid grid-cols-3 gap-3 text-right text-xs sm:min-w-72">
                <MoneyCell label="Upah" value={record.wage_amount} />
                <MoneyCell label="Dibayar" value={record.paid_wage_amount} />
                <MoneyCell label="Baki" value={balanceForDay} accent={balanceForDay > 0} />
              </div>}
            </div>
          </article>
        })}</div>
        : <ReportEmpty text="Tiada attendance dalam tempoh ini." />}
    </ReportSection>

    <ReportSection icon={WalletCards} title="Sejarah bayaran" description={`${payments.length} bayaran mengikut tarikh transaksi.`}>
      {payments.length
        ? <div className="report-list space-y-3">{payments.map((payment) => {
          const project = projectMap.get(payment.project_id)
          return <article key={payment.id} className="report-row card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black text-sky-700">{project?.project_no || 'Projek'}</p>
                <h3 className="mt-1 font-black">{formatDate(payment.period_start)} – {formatDate(payment.period_end)}</h3>
                <p className="mt-1 text-xs text-slate-500">Dibayar {formatDate(payment.payment_date)} · {paymentMethodLabel(payment.payment_method)}</p>
                {payment.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{payment.notes}</p>}
              </div>
              <div className="grid grid-cols-3 gap-4 text-right text-xs sm:min-w-80">
                <MoneyCell label="Kasar" value={payment.gross_amount} />
                <MoneyCell label="Tolak advance" value={payment.advance_deduction} />
                <MoneyCell label="Bersih" value={payment.net_amount} strong />
              </div>
            </div>
          </article>
        })}</div>
        : <ReportEmpty text="Tiada bayaran direkod dalam tempoh ini." />}
    </ReportSection>

    <ReportSection icon={HandCoins} title="Sejarah advance" description={`${advances.length} rekod pendahuluan mengikut tarikh transaksi.`}>
      {advances.length
        ? <div className="report-list space-y-3">{advances.map((advance) => {
          const project = projectMap.get(advance.project_id)
          return <article key={advance.id} className="report-row card flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div>
              <p className="text-xs font-black text-sky-700">{project?.project_no || 'Projek'}</p>
              <h3 className="mt-1 font-black">{formatDate(advance.advance_date)}</h3>
              <p className="mt-1 text-xs text-slate-500">{paymentMethodLabel(advance.payment_method)} · {advance.applied_wage_payment_id ? 'Sudah ditolak daripada upah' : 'Belum ditolak'}</p>
              {advance.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{advance.notes}</p>}
            </div>
            <p className="font-black text-amber-700">{formatMoney(advance.amount)}</p>
          </article>
        })}</div>
        : <ReportEmpty text="Tiada advance direkod dalam tempoh ini." />}
    </ReportSection>

    <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-400">
      Dijana pada {new Intl.DateTimeFormat('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}. Report ini berdasarkan rekod MRPI Workforce pada masa ia dijana.
    </footer>
  </div>
}

function ReportMetric({ icon: Icon, label, value, detail, tone = 'slate' }: { icon: typeof CalendarCheck; label: string; value: string; detail: string; tone?: 'slate' | 'sky' | 'emerald' | 'amber' }) {
  const styles = {
    slate: 'border-slate-200 bg-white text-slate-950',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }
  return <article className={`report-card rounded-2xl border p-5 ${styles[tone]}`}>
    <Icon className="h-5 w-5 opacity-60" />
    <p className="mt-4 text-[10px] font-black uppercase tracking-[.13em] opacity-60">{label}</p>
    <p className="mt-1 text-xl font-black">{value}</p>
    <p className="mt-1 text-xs leading-5 opacity-60">{detail}</p>
  </article>
}

function ReportSection({ icon: Icon, title, description, children }: { icon: typeof CalendarCheck; title: string; description: string; children: ReactNode }) {
  return <section className="mt-8">
    <div className="mb-3 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><Icon className="h-5 w-5" /></span>
      <div><h2 className="text-lg font-black">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p></div>
    </div>
    {children}
  </section>
}

const calendarDayNames = [
  { short: 'Is', full: 'Isnin' },
  { short: 'Se', full: 'Selasa' },
  { short: 'Ra', full: 'Rabu' },
  { short: 'Kh', full: 'Khamis' },
  { short: 'Ju', full: 'Jumaat' },
  { short: 'Sa', full: 'Sabtu' },
  { short: 'Ah', full: 'Ahad' },
]

function AttendanceLegend() {
  return <div className="attendance-calendar-legend flex flex-wrap gap-2">
    <LegendItem marker="✓" label="Full day" style="border-emerald-300 bg-emerald-50 text-emerald-800" />
    <LegendItem marker="½" label="½ day" style="border-amber-300 bg-amber-50 text-amber-800" />
    <LegendItem marker="×" label="Tidak hadir" style="border-rose-300 bg-rose-50 text-rose-800" />
    <LegendItem marker="●" label="Upah cover penuh" style="border-violet-300 bg-violet-50 text-violet-800" />
    <LegendItem marker="◐" label="Upah cover separa" style="border-orange-300 bg-orange-50 text-orange-800" />
    <LegendItem marker={<Banknote className="h-4 w-4" />} label="Bayaran diterima" style="border-sky-300 bg-sky-50 text-sky-800" />
    <LegendItem marker={<HandCoins className="h-4 w-4" />} label="Pinjaman diterima" style="border-amber-300 bg-amber-50 text-amber-800" />
    <LegendItem marker="—" label="Tiada rekod" style="border-slate-200 bg-white text-slate-500" />
  </div>
}

function LegendItem({ marker, label, style }: { marker: ReactNode; label: string; style: string }) {
  return <span className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-black ${style}`}><b className="text-base leading-none">{marker}</b>{label}</span>
}

function AttendanceCalendar({
  month,
  attendanceMap,
  paymentMap,
  advanceMap,
  projectMap,
  fromDate,
  toDate,
  today,
}: {
  month: ReportCalendarMonth
  attendanceMap: Map<string, Attendance>
  paymentMap: Map<string, CalendarPaymentSummary>
  advanceMap: Map<string, CalendarAdvanceSummary>
  projectMap: Map<number, Project>
  fromDate: string
  toDate: string
  today: string
}) {
  return <article className="attendance-calendar overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
      <h3 className="font-black capitalize">{month.label}</h3>
    </div>
    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
      {calendarDayNames.map((day) => <div key={day.full} className="px-1 py-2 text-center text-[9px] font-black uppercase tracking-wide text-slate-500 sm:text-[10px]"><span className="sm:hidden">{day.short}</span><span className="hidden sm:inline">{day.full}</span></div>)}
    </div>
    <div className="grid grid-cols-7 gap-px bg-slate-200">{month.dates.map((date, index) => {
      if (!date) return <div key={`empty-${index}`} className="min-h-20 bg-slate-50 sm:min-h-28" aria-hidden="true" />
      const record = attendanceMap.get(date)
      const payment = paymentMap.get(date)
      const advance = advanceMap.get(date)
      const project = record?.project_id ? projectMap.get(record.project_id) : null
      const withinPeriod = (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
      return <CalendarDay key={date} date={date} record={record} payment={payment} advance={advance} project={project} withinPeriod={withinPeriod} isToday={date === today} />
    })}</div>
  </article>
}

function CalendarDay({
  date,
  record,
  payment,
  advance,
  project,
  withinPeriod,
  isToday,
}: {
  date: string
  record?: Attendance
  payment?: CalendarPaymentSummary
  advance?: CalendarAdvanceSummary
  project?: Project | null
  withinPeriod: boolean
  isToday: boolean
}) {
  const status = record?.status
  const statusStyle = status === 'present'
    ? 'bg-emerald-50 text-emerald-900'
    : status === 'half_day'
      ? 'bg-amber-50 text-amber-900'
      : status === 'absent'
        ? 'bg-rose-50 text-rose-900'
        : 'bg-white text-slate-500'
  const marker = status === 'present' ? '✓' : status === 'half_day' ? '½' : status === 'absent' ? '×' : ''
  const shortLabel = status === 'present' ? 'Penuh' : status === 'half_day' ? '½ hari' : status === 'absent' ? 'Tidak hadir' : 'Tiada rekod'
  const paidAmount = record ? Math.max(0, record.paid_wage_amount) : 0
  const wageAmount = record ? Math.max(0, record.wage_amount) : 0
  const hasCoverage = wageAmount > 0 && paidAmount > 0
  const fullyCovered = hasCoverage && paidAmount >= wageAmount - 0.005
  const partiallyCovered = hasCoverage && !fullyCovered
  const attendanceDescription = record ? ` · ${attendanceLabel(record.status)} · ${project?.project_no || 'Tiada projek'}` : ' · Tiada rekod attendance'
  const coverageDescription = fullyCovered
    ? ` · Upah cover penuh ${formatMoney(paidAmount)} / ${formatMoney(wageAmount)}`
    : partiallyCovered
      ? ` · Upah cover separa ${formatMoney(paidAmount)} / ${formatMoney(wageAmount)}`
      : ''
  const paymentDescription = payment ? ` · Bayaran diterima ${formatMoney(payment.amount)}` : ''
  const advanceDescription = advance ? ` · Pinjaman diterima ${formatMoney(advance.amount)}` : ''
  const description = `${formatDate(date)}${attendanceDescription}${coverageDescription}${paymentDescription}${advanceDescription}`

  return <div title={description} className={`relative min-h-20 min-w-0 p-1.5 sm:min-h-28 sm:p-2 ${statusStyle} ${withinPeriod ? '' : 'opacity-40'}`}>
    <div className="flex items-start justify-between gap-1">
      <time dateTime={date} className={`grid h-6 min-w-6 place-items-center rounded-full text-[11px] font-black sm:text-xs ${isToday ? 'bg-sky-600 text-white' : ''}`}>{Number(date.slice(-2))}</time>
      {marker && <span className="text-lg font-black leading-none sm:text-xl" aria-label={shortLabel}>{marker}</span>}
    </div>
    {record && <div className="mt-1 min-w-0">
      <p className="hidden text-[10px] font-black sm:block">{shortLabel}</p>
      <p className="mt-0.5 truncate text-[8px] font-bold opacity-70 sm:text-[10px]">{project?.project_no || 'Tiada projek'}</p>
    </div>}
    {fullyCovered && <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-violet-600 px-1.5 py-1 text-[8px] font-black leading-none text-white shadow-sm sm:text-[9px]" aria-label={`Upah cover penuh ${formatMoney(paidAmount)} daripada ${formatMoney(wageAmount)}`}>
      <span className="text-[9px] leading-none">●</span><span className="truncate">Cover penuh</span>
    </div>}
    {partiallyCovered && <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-orange-500 px-1.5 py-1 text-[8px] font-black leading-none text-white shadow-sm sm:text-[9px]" aria-label={`Upah cover separa ${formatMoney(paidAmount)} daripada ${formatMoney(wageAmount)}`}>
      <span className="text-[10px] leading-none">◐</span><span className="truncate">Cover separa</span>
    </div>}
    {payment && <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-sky-600 px-1.5 py-1 text-[8px] font-black leading-none text-white shadow-sm sm:text-[10px]" aria-label={`Bayaran diterima ${formatMoney(payment.amount)}`}>
      <Banknote className="h-3 w-3 shrink-0" />
      <span className="truncate">{formatCalendarPayment(payment.amount)}</span>
    </div>}
    {advance && <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-amber-500 px-1.5 py-1 text-[8px] font-black leading-none text-white shadow-sm sm:text-[10px]" aria-label={`Pinjaman diterima ${formatMoney(advance.amount)}`}>
      <HandCoins className="h-3 w-3 shrink-0" />
      <span className="truncate">{formatCalendarPayment(advance.amount)}</span>
    </div>}
  </div>
}

function ProjectCard({ row, project, dailyWorker }: { row: WorkerProjectReport; project?: Project; dailyWorker: boolean }) {
  return <article className="report-card card p-5">
    <p className="text-xs font-black text-sky-700">{project?.project_no || `Projek #${row.projectId}`}</p>
    <h3 className="mt-1 line-clamp-2 font-black leading-6">{project?.project_name || 'Maklumat projek tidak tersedia'}</h3>
    <div className="mt-4 grid grid-cols-3 gap-3 border-y border-slate-100 py-4 text-center">
      <SmallStat label="Hari" value={formatUnits(row.payableDays)} />
      <SmallStat label="Penuh" value={String(row.fullDays)} />
      <SmallStat label="Separuh" value={String(row.halfDays)} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      {dailyWorker && <><MoneyLine label="Upah attendance" value={row.earnedWages} /><MoneyLine label="Baki attendance" value={row.outstandingWages} accent={row.outstandingWages > 0} /></>}
      <MoneyLine label="Bayaran kasar" value={row.paymentGross} />
      <MoneyLine label="Bayaran bersih" value={row.cashPaid} />
      <MoneyLine label="Advance" value={row.advancesRecorded} />
      <MoneyLine label="Advance belum tolak" value={row.unappliedAdvances} />
    </div>
  </article>
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-lg font-black">{value}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>
}

function MoneyLine({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div><p className="text-slate-500">{label}</p><p className={`mt-0.5 font-black ${accent ? 'text-amber-700' : 'text-slate-900'}`}>{formatMoney(value)}</p></div>
}

function MoneyCell({ label, value, accent = false, strong = false }: { label: string; value: number; accent?: boolean; strong?: boolean }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 ${strong ? 'text-base' : 'text-sm'} font-black ${accent ? 'text-amber-700' : 'text-slate-900'}`}>{formatMoney(value)}</p></div>
}

function StatusBadge({ status }: { status: Attendance['status'] }) {
  const style = status === 'absent' ? 'bg-rose-50 text-rose-700' : status === 'half_day' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${style}`}>{attendanceLabel(status)}</span>
}

function ReportEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{text}</div>
}

function paymentMethodLabel(value: WagePayment['payment_method']) {
  return paymentMethods.find((method) => method.value === value)?.label || value
}

function formatCalendarPayment(value: number) {
  return `RM${value.toLocaleString('en-MY', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('en-MY', { maximumFractionDigits: 2 })
}

function daysBefore(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() - days)
  return localDateISO(date)
}
