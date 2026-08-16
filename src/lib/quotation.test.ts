import { describe, expect, it } from 'vitest'
import {
  buildProjectTitle,
  buildWhatsAppText,
  createEmptyQuotationDraft,
  formatQuotationNumber,
  parseNonNegativeNumber,
  quotationDraftTotal,
  quotationItemAmount,
  quotationItemQuantity,
  quotationSectionTotal,
  quotationStoredItemsTotal,
  whatsappNumber,
  type QuotationDraftItem,
} from './quotation'

describe('quotation helpers', () => {
  it('calculates item and draft totals using exact cents', () => {
    const draft = createEmptyQuotationDraft()
    const item = {
      local_id: 'one', id: null, catalog_item_id: null,
      source_site_visit_id: null, source_site_visit_area_id: null, source_site_visit_entry_id: null,
      item_name: 'Item', description: 'Description', measurement_text: '',
      calculation_method: 'qty' as const, unit: 'unit', length_value: '', width_value: '', quantity: '2.5', rate: '12.30',
    }
    draft.sections = [{ local_id: 'section', id: null, source_site_visit_id: null, source_site_visit_area_id: null, name: 'Dapur', items: [item] }]
    expect(quotationItemAmount(item)).toBe(30.75)
    expect(quotationSectionTotal(draft.sections[0]!)).toBe(30.75)
    expect(quotationDraftTotal(draft)).toBe(30.75)
  })

  it('calculates an independent subtotal for every work area', () => {
    const draft = createEmptyQuotationDraft()
    const item = (localId: string, quantity: string, rate: string): QuotationDraftItem => ({
      local_id: localId, id: null, catalog_item_id: null,
      source_site_visit_id: null, source_site_visit_area_id: null, source_site_visit_entry_id: null,
      item_name: 'Item', description: 'Description', measurement_text: '',
      calculation_method: 'qty', unit: 'unit', length_value: '', width_value: '', quantity, rate,
    })
    draft.sections = [
      { local_id: 'dapur', id: null, source_site_visit_id: null, source_site_visit_area_id: null, name: 'Dapur', items: [item('one', '2', '100.25'), item('two', '1', '50.50')] },
      { local_id: 'porch', id: null, source_site_visit_id: null, source_site_visit_area_id: null, name: 'Porch', items: [item('three', '3', '10.10')] },
    ]

    expect(quotationSectionTotal(draft.sections[0]!)).toBe(251)
    expect(quotationSectionTotal(draft.sections[1]!)).toBe(30.3)
    expect(quotationDraftTotal(draft)).toBe(281.3)
  })

  it('derives real area and length quantities from their dimensions', () => {
    const areaItem: QuotationDraftItem = {
      local_id: 'area', id: null, catalog_item_id: null,
      source_site_visit_id: null, source_site_visit_area_id: null, source_site_visit_entry_id: null,
      item_name: 'Tiles', description: 'Floor tiles', measurement_text: '',
      calculation_method: 'area', unit: 'KPS', length_value: '12', width_value: '8.5', quantity: '1', rate: '10',
    }
    const lengthItem = { ...areaItem, local_id: 'length', calculation_method: 'length' as const, unit: 'kaki', length_value: '12.5', width_value: '', rate: '20' }

    expect(quotationItemQuantity(areaItem)).toBe(102)
    expect(quotationItemAmount(areaItem)).toBe(1020)
    expect(quotationItemQuantity(lengthItem)).toBe(12.5)
    expect(quotationItemAmount(lengthItem)).toBe(250)
  })

  it('calculates PDF subtotals from stored item amounts with a safe fallback', () => {
    expect(quotationStoredItemsTotal([
      { amount: 200.5, quantity: 2, rate: 100.25 },
      { amount: null, quantity: 3, rate: 10.1 },
    ])).toBe(230.8)
  })

  it('keeps generated defaults manually replaceable', () => {
    expect(buildProjectTitle('ms', 'Segamat')).toBe('CADANGAN KERJA UBAH SUAI DI Segamat')
    expect(buildProjectTitle('en', 'Segamat')).toBe('PROPOSED RENOVATION WORKS AT Segamat')
    expect(formatQuotationNumber('SH050826-01', 2)).toBe('SH050826-01/R2')
  })

  it('normalizes numbers for calculations and WhatsApp', () => {
    expect(parseNonNegativeNumber('1,250.50')).toBe(1250.5)
    expect(parseNonNegativeNumber('-1')).toBeNull()
    expect(whatsappNumber('012-345 6789')).toBe('60123456789')
  })

  it('builds a useful WhatsApp summary without exposing internal links', () => {
    const draft = createEmptyQuotationDraft()
    draft.header.client_name = 'Ali'
    draft.header.project_title = 'Ubah suai dapur'
    draft.header.quotation_no = 'SH050826-01'
    expect(buildWhatsAppText(draft)).toContain('Salam Ali')
    expect(buildWhatsAppText(draft)).toContain('SH050826-01')
  })
})
