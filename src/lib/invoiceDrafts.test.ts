import { beforeEach, describe, expect, it } from 'vitest'
import { blankInvoiceItem, type InvoiceDraft } from './invoice'
import { clearInvoiceDraft, readInvoiceDraft, saveInvoiceDraft } from './invoiceDrafts'

function draft(): InvoiceDraft {
  return {
    version: 1,
    invoice_id: 12,
    project_id: 4,
    invoice_no: 'INV-2026-003',
    invoice_date: '2026-08-06',
    due_date: '',
    title: 'TUNTUTAN BAYARAN KEMAJUAN',
    notes: '',
    status: 'draft',
    items: [{ ...blankInvoiceItem(), description: 'Catatan tidak boleh hilang', amount: '3000' }],
    saved_at: new Date(0).toISOString(),
  }
}

describe('invoice draft persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores the complete invoice after an app switch', () => {
    saveInvoiceDraft('owner-1', 12, draft())
    expect(readInvoiceDraft('owner-1', 12)?.items[0]?.description).toBe('Catatan tidak boleh hilang')
  })

  it('rejects a draft stored for another invoice', () => {
    saveInvoiceDraft('owner-1', 12, draft())
    expect(readInvoiceDraft('owner-1', 13)).toBeNull()
  })

  it('clears the local checkpoint after a successful issue', () => {
    saveInvoiceDraft('owner-1', 12, draft())
    clearInvoiceDraft('owner-1', 12)
    expect(readInvoiceDraft('owner-1', 12)).toBeNull()
  })
})
