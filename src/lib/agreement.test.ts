import { describe, expect, it } from 'vitest'
import {
  agreementAcceptanceLabel,
  agreementStatusLabel,
  defaultAgreementForm,
  isAgreementSnapshotData,
  validateAgreementForm,
} from './agreement'

describe('agreement helpers', () => {
  it('starts with a professional editable title', () => {
    const form = defaultAgreementForm()
    expect(form.title).toBe('PERJANJIAN KERJA UBAH SUAI')
    expect(validateAgreementForm(form)).toBeNull()
  })

  it('requires the document title and issue date', () => {
    expect(validateAgreementForm({ ...defaultAgreementForm(), title: ' ' })).toContain('Tajuk')
    expect(validateAgreementForm({ ...defaultAgreementForm(), issue_date: '' })).toContain('Tarikh')
  })

  it('uses clear workflow labels', () => {
    expect(agreementStatusLabel('issued')).toBe('Dikeluarkan')
    expect(agreementAcceptanceLabel('whatsapp')).toContain('WhatsApp')
  })

  it('rejects incomplete snapshot shapes', () => {
    expect(isAgreementSnapshotData({ agreement: {} })).toBe(false)
  })
})
