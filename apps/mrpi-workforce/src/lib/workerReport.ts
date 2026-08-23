import type { Attendance, WagePayment, WorkerAdvance } from '../types/domain'
import { attendanceUnits, outstandingAttendanceWage } from './workforce'

export type WorkerReportTotals = {
  fullDays: number
  halfDays: number
  absentDays: number
  payableDays: number
  overtimeHours: number
  earnedWages: number
  attendancePaid: number
  outstandingWages: number
  paymentCount: number
  paymentGross: number
  advanceDeductions: number
  cashPaid: number
  advancesRecorded: number
  unappliedAdvances: number
}

export type WorkerProjectReport = WorkerReportTotals & {
  projectId: number
}

const emptyTotals = (): WorkerReportTotals => ({
  fullDays: 0,
  halfDays: 0,
  absentDays: 0,
  payableDays: 0,
  overtimeHours: 0,
  earnedWages: 0,
  attendancePaid: 0,
  outstandingWages: 0,
  paymentCount: 0,
  paymentGross: 0,
  advanceDeductions: 0,
  cashPaid: 0,
  advancesRecorded: 0,
  unappliedAdvances: 0,
})

function round(value: number) {
  return Math.round(value * 100) / 100
}

function addAttendance(totals: WorkerReportTotals, record: Attendance) {
  if (record.status === 'present') totals.fullDays += 1
  if (record.status === 'half_day') totals.halfDays += 1
  if (record.status === 'absent') totals.absentDays += 1
  totals.payableDays += attendanceUnits(record.status)
  totals.overtimeHours += record.overtime_hours
  totals.earnedWages += record.wage_amount
  totals.attendancePaid += record.paid_wage_amount
  totals.outstandingWages += outstandingAttendanceWage(record.wage_amount, record.paid_wage_amount)
}

function addAdvance(totals: WorkerReportTotals, advance: WorkerAdvance) {
  totals.advancesRecorded += advance.amount
  if (advance.applied_wage_payment_id === null) totals.unappliedAdvances += advance.amount
}

function addPayment(totals: WorkerReportTotals, payment: WagePayment) {
  totals.paymentCount += 1
  totals.paymentGross += payment.gross_amount
  totals.advanceDeductions += payment.advance_deduction
  totals.cashPaid += payment.net_amount
}

function rounded(totals: WorkerReportTotals): WorkerReportTotals {
  return {
    ...totals,
    payableDays: round(totals.payableDays),
    overtimeHours: round(totals.overtimeHours),
    earnedWages: round(totals.earnedWages),
    attendancePaid: round(totals.attendancePaid),
    outstandingWages: round(totals.outstandingWages),
    paymentGross: round(totals.paymentGross),
    advanceDeductions: round(totals.advanceDeductions),
    cashPaid: round(totals.cashPaid),
    advancesRecorded: round(totals.advancesRecorded),
    unappliedAdvances: round(totals.unappliedAdvances),
  }
}

export function buildWorkerReportTotals(
  attendance: Attendance[],
  advances: WorkerAdvance[],
  payments: WagePayment[],
) {
  const totals = emptyTotals()
  attendance.forEach((record) => addAttendance(totals, record))
  advances.forEach((advance) => addAdvance(totals, advance))
  payments.forEach((payment) => addPayment(totals, payment))
  return rounded(totals)
}

export function buildWorkerProjectReports(
  attendance: Attendance[],
  advances: WorkerAdvance[],
  payments: WagePayment[],
) {
  const rows = new Map<number, WorkerReportTotals>()
  const forProject = (projectId: number) => {
    const existing = rows.get(projectId)
    if (existing) return existing
    const created = emptyTotals()
    rows.set(projectId, created)
    return created
  }

  attendance.forEach((record) => {
    if (record.project_id !== null) addAttendance(forProject(record.project_id), record)
  })
  advances.forEach((advance) => addAdvance(forProject(advance.project_id), advance))
  payments.forEach((payment) => addPayment(forProject(payment.project_id), payment))

  return [...rows.entries()].map(([projectId, totals]) => ({
    projectId,
    ...rounded(totals),
  })) as WorkerProjectReport[]
}
