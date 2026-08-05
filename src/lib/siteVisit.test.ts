import { describe, expect, it, vi } from 'vitest'
import {
  buildSitePhotoPath,
  guidePrompts,
  isValidPhone,
  localDateInputValue,
  lookupJohorPostcode,
  normalizePhone,
  validateSitePhoto,
} from './siteVisit'

describe('site visit helpers', () => {
  it('normalizes and validates Malaysian phone numbers', () => {
    expect(normalizePhone('+60 12-345 6789')).toBe('60123456789')
    expect(isValidPhone('012-345 6789')).toBe(true)
    expect(isValidPhone('123')).toBe(false)
  })

  it('suggests editable Johor cities from postcodes', () => {
    expect(lookupJohorPostcode('85000')).toEqual({ city: 'Segamat', state: 'Johor' })
    expect(lookupJohorPostcode('85200')).toEqual({ city: 'Jementah', state: 'Johor' })
    expect(lookupJohorPostcode('83123')).toEqual({ city: 'Batu Pahat', state: 'Johor' })
    expect(lookupJohorPostcode('50000')).toBeNull()
  })

  it('keeps free text guides and dates predictable', () => {
    expect(guidePrompts(['Ukuran', 12, '', 'Kemasan'])).toEqual(['Ukuran', 'Kemasan'])
    expect(localDateInputValue(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05')
  })

  it('validates private photo uploads and creates an owner-first path', () => {
    const valid = new File(['photo'], 'porch.jpg', { type: 'image/jpeg' })
    const invalid = new File(['photo'], 'porch.gif', { type: 'image/gif' })
    expect(validateSitePhoto(valid)).toBeNull()
    expect(validateSitePhoto(invalid)).toBe('Gunakan gambar JPG, PNG atau WebP.')

    vi.stubGlobal('crypto', { randomUUID: () => 'photo-id' })
    expect(buildSitePhotoPath('user-1', 7, 9, valid)).toBe('user-1/7/9/photo-id.jpg')
    vi.unstubAllGlobals()
  })
})
