import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyQuotationDraft } from './quotation'
import { clearQuotationDraft, readQuotationDraft, saveQuotationDraft } from './quotationDrafts'

describe('quotation draft persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores a draft after a page or app switch', () => {
    const draft = createEmptyQuotationDraft()
    draft.header.client_name = 'Pelanggan disimpan'
    saveQuotationDraft('owner-1', 'visit:8', draft)
    expect(readQuotationDraft('owner-1', 'visit:8')?.header.client_name).toBe('Pelanggan disimpan')
  })

  it('clears only the requested draft', () => {
    saveQuotationDraft('owner-1', 'manual', createEmptyQuotationDraft())
    saveQuotationDraft('owner-1', 'visit:8', createEmptyQuotationDraft())
    clearQuotationDraft('owner-1', 'manual')
    expect(readQuotationDraft('owner-1', 'manual')).toBeNull()
    expect(readQuotationDraft('owner-1', 'visit:8')).not.toBeNull()
  })
})
