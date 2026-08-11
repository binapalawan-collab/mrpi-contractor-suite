import { beforeEach, describe, expect, it } from 'vitest'
import { clearPaymentScheduleLocal, loadPaymentScheduleLocal, paymentScheduleAmount, paymentScheduleDraftKey, paymentScheduleTemplate, paymentScheduleTotal, savePaymentScheduleLocal, validatePaymentSchedule, type PaymentScheduleDraft } from './paymentSchedule'

describe('payment schedule', () => {
  beforeEach(() => localStorage.clear())

  it.each(['4', '5', '8'] as const)('builds a %s-stage template totalling 100%%', (template) => {
    const stages = paymentScheduleTemplate(template)
    expect(stages).toHaveLength(Number(template))
    expect(paymentScheduleTotal(stages)).toBe(100)
  })

  it('calculates the amount from contract basis and percentage', () => {
    expect(paymentScheduleAmount(68_500, '20')).toBe(13_700)
    expect(paymentScheduleAmount(768, '33.333')).toBe(256)
  })

  it('rejects a schedule that does not total exactly 100%', () => {
    const draft: PaymentScheduleDraft = { version: 1, project_id: 1, title: 'Jadual', notes: '', stages: paymentScheduleTemplate('4'), saved_at: '' }
    draft.stages[0]!.percentage = '20'
    expect(validatePaymentSchedule(draft)).toContain('90%')
  })

  it('retains the draft across an app switch or reload', () => {
    const key = paymentScheduleDraftKey('owner', 1)
    const draft: PaymentScheduleDraft = { version: 1, project_id: 1, title: 'Jadual saya', notes: 'Nota', stages: paymentScheduleTemplate('manual'), saved_at: '' }
    savePaymentScheduleLocal(key, draft)
    expect(loadPaymentScheduleLocal(key)?.title).toBe('Jadual saya')
    clearPaymentScheduleLocal(key)
    expect(loadPaymentScheduleLocal(key)).toBeNull()
  })
})
