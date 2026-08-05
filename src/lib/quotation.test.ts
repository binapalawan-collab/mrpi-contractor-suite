import { describe, expect, it } from 'vitest'
import {
  buildProjectTitle,
  buildWhatsAppText,
  createEmptyQuotationDraft,
  formatQuotationNumber,
  parseNonNegativeNumber,
  quotationDraftTotal,
  quotationItemAmount,
  whatsappNumber,
} from './quotation'

describe('quotation helpers', () => {
  it('calculates item and draft totals using exact cents', () => {
    const draft = createEmptyQuotationDraft()
    const item = {
      local_id: 'one', id: null, catalog_item_id: null,
      source_site_visit_id: null, source_site_visit_area_id: null, source_site_visit_entry_id: null,
      item_name: 'Item', description: 'Description', measurement_text: '',
      calculation_method: 'qty' as const, unit: 'unit', quantity: '2.5', rate: '12.30',
    }
    draft.sections = [{ local_id: 'section', id: null, source_site_visit_id: null, source_site_visit_area_id: null, name: 'Dapur', items: [item] }]
    expect(quotationItemAmount(item)).toBe(30.75)
    expect(quotationDraftTotal(draft)).toBe(30.75)
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
