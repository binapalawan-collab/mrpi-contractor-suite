import { describe, expect, it } from 'vitest'
import {
  formatProjectDate,
  effectiveRateForLockedAmount,
  calculationMethodLabel,
  nextProjectStatus,
  projectAddress,
  projectStatusActionLabel,
  projectStatusLabel,
} from './project'

describe('project workflow', () => {
  it('uses the agreed sequential operational statuses', () => {
    expect(projectStatusLabel('preparation')).toBe('Persediaan')
    expect(nextProjectStatus('preparation')).toBe('scheduled')
    expect(nextProjectStatus('scheduled')).toBe('active')
    expect(nextProjectStatus('active')).toBe('work_completed')
    expect(nextProjectStatus('work_completed')).toBe('handed_over')
    expect(nextProjectStatus('handed_over')).toBeNull()
    expect(projectStatusActionLabel('active')).toBe('Tandakan Siap Kerja')
  })

  it('formats the locked project address and dates for Malaysia', () => {
    expect(projectAddress({
      address_line_1: '12, Jalan Mawar',
      address_line_2: null,
      postcode: '85000',
      city: 'Segamat',
      state: 'Johor',
    })).toBe('12, Jalan Mawar, 85000 Segamat, Johor')
    expect(formatProjectDate('2026-08-05')).toContain('2026')
    expect(formatProjectDate(null)).toBe('Belum ditetapkan')
  })

  it('derives an effective rate while keeping the item amount locked', () => {
    expect(effectiveRateForLockedAmount(1000, 120)).toBe(8.333333)
    expect(effectiveRateForLockedAmount(1000, 0)).toBeNull()
    expect(calculationMethodLabel('area')).toBe('Keluasan')
  })
})
