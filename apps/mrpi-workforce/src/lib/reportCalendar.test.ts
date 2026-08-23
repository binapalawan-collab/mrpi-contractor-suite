import { describe, expect, it } from 'vitest'
import { buildReportCalendarMonths } from './reportCalendar'

describe('report calendar', () => {
  it('builds a Monday-first calendar with complete weeks', () => {
    const [august] = buildReportCalendarMonths('2026-08-01', '2026-08-31', [], '2026-08-23')

    expect(august?.key).toBe('2026-08')
    expect(august?.label).toBe('Ogos 2026')
    expect(august?.dates).toHaveLength(42)
    expect(august?.dates.slice(0, 7)).toEqual([null, null, null, null, null, '2026-08-01', '2026-08-02'])
    expect(august?.dates.at(-1)).toBeNull()
  })

  it('creates one calendar for every month crossed by the selected period', () => {
    const months = buildReportCalendarMonths('2026-08-20', '2026-10-03', [], '2026-08-23')
    expect(months.map((month) => month.key)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('derives the calendar range from attendance when all dates are selected', () => {
    const months = buildReportCalendarMonths('', '', ['2026-07-31', '2026-09-01'], '2026-08-23')
    expect(months.map((month) => month.key)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('falls back to the current month when the report has no attendance', () => {
    const months = buildReportCalendarMonths('', '', [], '2026-08-23')
    expect(months.map((month) => month.key)).toEqual(['2026-08'])
  })
})
