import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyQuotationDraft, localId, type QuotationDraftItem } from './quotation'
import {
  clearQuotationDraft,
  clearQuotationItemDraft,
  readQuotationDraft,
  readQuotationItemDraft,
  saveQuotationDraft,
  saveQuotationItemDraft,
} from './quotationDrafts'

function itemDraft(): QuotationDraftItem {
  return {
    local_id: localId(),
    id: null,
    catalog_item_id: null,
    source_site_visit_id: 8,
    source_site_visit_area_id: 10,
    source_site_visit_entry_id: 12,
    item_name: 'Tabletop dapur',
    description: 'Membina tabletop konkrit',
    measurement_text: '12 kaki',
    calculation_method: 'length',
    unit: 'kaki',
    quantity: '12',
    rate: '230.00',
  }
}

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

  it('restores the open item editor together with its site visit reference', () => {
    saveQuotationItemDraft('owner-1', 'visit:8', {
      section_local_id: 'section-kitchen',
      item: itemDraft(),
      mode: 'manual',
      search: 'tabletop',
      category_id: 3,
      source_note: { note_text: 'Tabletop bahagian sinki', measurement_text: '12 kaki' },
    })

    const restored = readQuotationItemDraft('owner-1', 'visit:8')
    expect(restored).toMatchObject({
      version: 1,
      section_local_id: 'section-kitchen',
      mode: 'manual',
      search: 'tabletop',
      category_id: 3,
      source_note: { note_text: 'Tabletop bahagian sinki', measurement_text: '12 kaki' },
      item: { item_name: 'Tabletop dapur', quantity: '12', rate: '230.00' },
    })

    clearQuotationItemDraft('owner-1', 'visit:8')
    expect(readQuotationItemDraft('owner-1', 'visit:8')).toBeNull()
  })

  it('clears a pending item when its quotation draft is cleared', () => {
    saveQuotationDraft('owner-1', 'manual', createEmptyQuotationDraft())
    saveQuotationItemDraft('owner-1', 'manual', {
      section_local_id: 'section-1',
      item: itemDraft(),
      mode: 'manual',
      search: '',
      category_id: 'all',
      source_note: null,
    })

    clearQuotationDraft('owner-1', 'manual')
    expect(readQuotationDraft('owner-1', 'manual')).toBeNull()
    expect(readQuotationItemDraft('owner-1', 'manual')).toBeNull()
  })
})
