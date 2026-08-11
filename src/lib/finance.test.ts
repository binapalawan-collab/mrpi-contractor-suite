import { describe, expect, it } from 'vitest'
import { agingSummary, buildStatementTransactions, invoiceAgingBucket, projectFinanceSummary } from './finance'
import type { Invoice, InvoicePayment } from './invoice'
import type { Project } from './project'

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 1, project_id: 10, company_id: 1, owner_user_id: 'owner', invoice_no: 'INV-001',
  invoice_date: '2026-06-01', due_date: '2026-06-15', title: 'Tuntutan 1', notes: '',
  status: 'issued', total_amount: 1000, paid_amount: 0, balance_amount: 1000,
  contract_value_snapshot: 5000, previous_billed_amount_snapshot: 0,
  contract_balance_after_snapshot: 4000, issued_at: '2026-06-01T08:00:00Z', fully_paid_at: null,
  voided_at: null, created_at: '2026-06-01T07:00:00Z', updated_at: '2026-06-01T08:00:00Z',
  ...overrides,
})

const payment = (overrides: Partial<InvoicePayment> = {}): InvoicePayment => ({
  id: 1, invoice_id: 1, project_id: 10, company_id: 1, owner_user_id: 'owner', receipt_no: 'RC-001',
  payment_date: '2026-06-10', amount: 400, payment_method: 'bank_transfer', reference_no: null,
  notes: '', invoice_total_snapshot: 1000, paid_before_snapshot: 0, paid_after_snapshot: 400,
  balance_after_snapshot: 600, created_at: '2026-06-10T09:00:00Z',
  ...overrides,
})

describe('finance summaries and statements', () => {
  it('excludes draft and void invoices from posted totals', () => {
    const project = { current_contract_amount: 5000 } as Project
    const summary = projectFinanceSummary(project, [invoice(), invoice({ id: 2, status: 'draft', total_amount: 800 }), invoice({ id: 3, status: 'void', total_amount: 200 })], [payment()])
    expect(summary).toEqual({ contractValue: 5000, billed: 1000, received: 400, outstanding: 600, unbilled: 4000 })
  })

  it('builds a chronological running balance from invoices and receipts', () => {
    const rows = buildStatementTransactions([invoice()], [payment()])
    expect(rows.map(({ kind, debit, credit, balance }) => ({ kind, debit, credit, balance }))).toEqual([
      { kind: 'invoice', debit: 1000, credit: 0, balance: 1000 },
      { kind: 'payment', debit: 0, credit: 400, balance: 600 },
    ])
  })

  it('ignores payments tied to a non-posted invoice', () => {
    expect(buildStatementTransactions([invoice({ status: 'void' })], [payment()])).toEqual([])
  })

  it('classifies outstanding invoices by days overdue', () => {
    expect(invoiceAgingBucket(invoice(), '2026-06-15')).toBe('current')
    expect(invoiceAgingBucket(invoice(), '2026-06-25')).toBe('days_1_30')
    expect(invoiceAgingBucket(invoice(), '2026-07-30')).toBe('days_31_60')
    expect(invoiceAgingBucket(invoice(), '2026-08-20')).toBe('days_61_plus')
  })

  it('does not age paid, draft or void balances', () => {
    const result = agingSummary([
      invoice({ balance_amount: 500 }),
      invoice({ id: 2, status: 'paid', balance_amount: 0 }),
      invoice({ id: 3, status: 'draft', balance_amount: 700 }),
      invoice({ id: 4, status: 'void', balance_amount: 900 }),
    ], '2026-06-25')
    expect(result).toEqual({ current: 0, days_1_30: 500, days_31_60: 0, days_61_plus: 0 })
  })
})
