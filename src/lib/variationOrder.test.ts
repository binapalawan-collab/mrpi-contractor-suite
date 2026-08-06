import { describe, expect, it } from 'vitest'
import {
  blankVariationOrderItem,
  formatSignedMoney,
  variationChangeTypeLabel,
  variationOrderDraftTotal,
  variationOrderNumber,
} from './variationOrder'

describe('Variation Order calculations', () => {
  it('calculates additions and deductions as a net value', () => {
    const addition = { ...blankVariationOrderItem(), quantity: '2', rate: '500.00', direction: 'add' as const }
    const deduction = { ...blankVariationOrderItem(), quantity: '1', rate: '250.00', direction: 'deduct' as const }
    expect(variationOrderDraftTotal({ sections: [{ local_id: 's1', id: null, source_project_section_id: null, name: 'Porch', items: [addition, deduction] }] })).toBe(750)
  })

  it('formats revision, change type and signed money clearly', () => {
    expect(variationOrderNumber('VO-001', 2)).toBe('VO-001/R2')
    expect(variationChangeTypeLabel('replacement')).toBe('Penggantian')
    expect(formatSignedMoney(-125)).toContain('− RM')
    expect(formatSignedMoney(125)).toContain('+ RM')
  })
})
