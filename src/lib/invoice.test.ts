import { describe, expect, it } from 'vitest'
import {
  blankInvoiceItem,
  invoiceDraftTotal,
  isInvoiceOverdue,
  progressAmount,
  projectInvoiceTotals,
  validateInvoiceDraft,
  type Invoice,
  type InvoiceDraft,
} from './invoice'

function draft(): InvoiceDraft {
  return {
    version: 1,
    invoice_id: 10,
    project_id: 5,
    invoice_no: 'INV-2026-001',
    invoice_date: '2026-08-06',
    due_date: '2026-08-20',
    title: 'TUNTUTAN BAYARAN KEMAJUAN',
    notes: '',
    status: 'draft',
    items: [],
    saved_at: new Date(0).toISOString(),
  }
}

function invoice(status: string, total: number, paid: number): Invoice {
  return {
    id: Math.random(), project_id: 1, company_id: 1, owner_user_id: 'owner',
    invoice_no: 'INV-2026-001', invoice_date: '2026-08-01', due_date: '2026-08-05',
    title: 'Tuntutan', notes: '', status, total_amount: total, paid_amount: paid,
    balance_amount: total - paid, contract_value_snapshot: 100_000,
    previous_billed_amount_snapshot: 0, contract_balance_after_snapshot: 100_000 - total,
    issued_at: status === 'draft' ? null : '2026-08-01T00:00:00Z', fully_paid_at: status === 'paid' ? '2026-08-02T00:00:00Z' : null,
    voided_at: status === 'void' ? '2026-08-02T00:00:00Z' : null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  }
}

describe('invoice calculations', () => {
  it('calculates flexible progress percentages against the current contract', () => {
    expect(progressAmount(120_000, '25')).toBe(30_000)
    expect(progressAmount(120_000, '101')).toBe(0)
  })

  it('adds progress, VO and manual lines', () => {
    const current = draft()
    current.items = [
      { ...blankInvoiceItem('progress'), amount: '12000.00' },
      { ...blankInvoiceItem('approved_variation'), variation_order_id: 4, amount: '3500.50' },
      { ...blankInvoiceItem('manual'), amount: '499.50' },
    ]
    expect(invoiceDraftTotal(current)).toBe(16_000)
  })

  it('rejects an empty invoice and accepts a complete manual claim', () => {
    const current = draft()
    expect(validateInvoiceDraft(current)).toContain('sekurang-kurangnya')
    current.items = [{ ...blankInvoiceItem(), description: 'Peringkat 1', amount: '6000' }]
    expect(validateInvoiceDraft(current)).toBeNull()
  })

  it('summarises issued and partial invoices without counting drafts or voids', () => {
    expect(projectInvoiceTotals([
      invoice('draft', 9_000, 0),
      invoice('issued', 6_000, 0),
      invoice('partially_paid', 6_000, 3_000),
      invoice('paid', 4_000, 4_000),
      invoice('void', 2_000, 0),
    ])).toEqual({ billed: 16_000, paid: 7_000, outstanding: 9_000 })
  })

  it('derives overdue state only for an unpaid issued invoice', () => {
    expect(isInvoiceOverdue(invoice('issued', 6_000, 0), '2026-08-06')).toBe(true)
    expect(isInvoiceOverdue(invoice('paid', 6_000, 6_000), '2026-08-06')).toBe(false)
  })
})
