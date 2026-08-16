import { describe, expect, it } from 'vitest'
import {
  agreementAcceptanceLabel,
  agreementErrorMessage,
  agreementStatusLabel,
  defaultAgreementForm,
  isAgreementSnapshotData,
  validateAgreementAcceptance,
  validateAgreementForm,
  validateAgreementIssueForm,
} from './agreement'
import {
  agreementDocumentTermsFromSnapshot,
  agreementTemplateVersion,
  currentAgreementDocumentTerms,
} from './agreementTerms'

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

  it('requires duration and defect terms before issue, while still allowing an incomplete draft', () => {
    const draft = defaultAgreementForm()
    expect(validateAgreementForm(draft)).toBeNull()
    expect(validateAgreementIssueForm(draft)).toContain('Tempoh kerja')
    expect(validateAgreementIssueForm({ ...draft, work_duration_text: '12 minggu' })).toContain('kecacatan')
    expect(validateAgreementIssueForm({ ...draft, work_duration_text: '12 minggu', defect_terms: '90 hari' })).toBeNull()
  })

  it('requires traceable acceptance evidence', () => {
    expect(validateAgreementAcceptance('whatsapp', '', false)).toContain('Catatan')
    expect(validateAgreementAcceptance('whatsapp', 'Baim, 16 Ogos 2026, 3:10 petang', false)).toContain('WhatsApp')
    expect(validateAgreementAcceptance('uploaded', 'Ditandatangani 16 Ogos 2026', false)).toContain('salinan')
    expect(validateAgreementAcceptance('physical', 'Asal ditandatangani oleh Baim pada 16 Ogos 2026', false)).toBeNull()
    expect(validateAgreementAcceptance('whatsapp', 'Baim, 16 Ogos 2026, 3:10 petang', true)).toBeNull()
  })

  it('uses clear workflow labels', () => {
    expect(agreementStatusLabel('issued')).toBe('Dikeluarkan')
    expect(agreementAcceptanceLabel('whatsapp')).toContain('WhatsApp')
  })

  it('rejects incomplete snapshot shapes', () => {
    expect(isAgreementSnapshotData({ agreement: {} })).toBe(false)
  })

  it('shows Supabase RPC messages instead of hiding plain-object errors', () => {
    expect(agreementErrorMessage({ message: 'Simpan Jadual Pembayaran dahulu.' }, 'Tindakan gagal.'))
      .toBe('Simpan Jadual Pembayaran dahulu.')
    expect(agreementErrorMessage({}, 'Tindakan gagal.')).toBe('Tindakan gagal.')
  })

  it('resolves a frozen template version to its immutable clause set', () => {
    const current = currentAgreementDocumentTerms()
    const resolved = agreementDocumentTermsFromSnapshot({ template_version: agreementTemplateVersion, governing_law: 'Malaysia' })
    expect(resolved).toEqual(current)
    expect(resolved?.standard_terms.flatMap((section) => section.clauses).length).toBeGreaterThan(20)
    expect(agreementDocumentTermsFromSnapshot({ template_version: 'UNKNOWN', governing_law: 'Malaysia' })).toBeNull()
  })
})
