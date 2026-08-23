import { describe, expect, it } from 'vitest'
import type { Attendance, WagePayment, WorkerAdvance } from '../types/domain'
import { buildWorkerProjectReports, buildWorkerReportTotals } from './workerReport'

function attendance(overrides: Partial<Attendance>): Attendance {
  return {
    id: 1,
    worker_id: 2,
    project_id: 10,
    company_id: 1,
    owner_user_id: 'owner',
    attendance_date: '2026-08-20',
    status: 'present',
    pay_type_snapshot: 'daily',
    daily_rate_snapshot: 100,
    overtime_hours: 0,
    overtime_rate: 0,
    wage_amount: 100,
    paid_wage_amount: 0,
    wage_payment_id: null,
    notes: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function advance(overrides: Partial<WorkerAdvance>): WorkerAdvance {
  return {
    id: 1,
    worker_id: 2,
    project_id: 10,
    advance_date: '2026-08-20',
    amount: 40,
    payment_method: 'cash',
    notes: '',
    applied_wage_payment_id: null,
    created_at: '',
    ...overrides,
  }
}

function payment(overrides: Partial<WagePayment>): WagePayment {
  return {
    id: 1,
    worker_id: 2,
    project_id: 10,
    period_start: '2026-08-01',
    period_end: '2026-08-20',
    payment_date: '2026-08-20',
    gross_amount: 150,
    advance_deduction: 40,
    net_amount: 110,
    payment_method: 'cash',
    notes: '',
    created_at: '',
    ...overrides,
  }
}

describe('worker report totals', () => {
  it('summarises attendance, partial settlement, payments and advances without mixing meanings', () => {
    const result = buildWorkerReportTotals(
      [
        attendance({ paid_wage_amount: 60 }),
        attendance({ id: 2, status: 'half_day', wage_amount: 50, paid_wage_amount: 50, overtime_hours: 1 }),
        attendance({ id: 3, project_id: null, status: 'absent', wage_amount: 0 }),
      ],
      [advance({}), advance({ id: 2, amount: 20, applied_wage_payment_id: 1 })],
      [payment({})],
    )

    expect(result).toMatchObject({
      fullDays: 1,
      halfDays: 1,
      absentDays: 1,
      payableDays: 1.5,
      overtimeHours: 1,
      earnedWages: 150,
      attendancePaid: 110,
      outstandingWages: 40,
      paymentCount: 1,
      paymentGross: 150,
      advanceDeductions: 40,
      cashPaid: 110,
      advancesRecorded: 60,
      unappliedAdvances: 40,
    })
  })

  it('groups activity under the correct project and omits projectless absence', () => {
    const result = buildWorkerProjectReports(
      [attendance({}), attendance({ id: 2, project_id: 20, status: 'half_day', wage_amount: 50 }), attendance({ id: 3, project_id: null, status: 'absent', wage_amount: 0 })],
      [advance({ project_id: 20 })],
      [payment({ project_id: 10 })],
    )

    expect(result).toHaveLength(2)
    expect(result.find((row) => row.projectId === 10)).toMatchObject({ payableDays: 1, earnedWages: 100, paymentGross: 150 })
    expect(result.find((row) => row.projectId === 20)).toMatchObject({ payableDays: 0.5, earnedWages: 50, advancesRecorded: 40 })
  })
})
