import { describe, expect, it, vi } from 'vitest'
import {
  buildCompanyAssetPath,
  companyAssetMaxBytes,
  validateCompanyAsset,
} from './companyAssets'

describe('company profile assets', () => {
  it('accepts supported images up to 5 MB', () => {
    expect(validateCompanyAsset(new File(['signature'], 'signature.png', { type: 'image/png' }))).toBeNull()
    expect(validateCompanyAsset(new File(['stamp'], 'stamp.webp', { type: 'image/webp' }))).toBeNull()
  })

  it('rejects empty, unsupported and oversized files', () => {
    expect(validateCompanyAsset(new File([], 'empty.png', { type: 'image/png' }))).toBe('Fail imej kosong.')
    expect(validateCompanyAsset(new File(['pdf'], 'stamp.pdf', { type: 'application/pdf' }))).toBe('Gunakan imej JPG, PNG atau WebP.')
    const oversized = new File([new Uint8Array(companyAssetMaxBytes + 1)], 'large.jpg', { type: 'image/jpeg' })
    expect(validateCompanyAsset(oversized)).toBe('Saiz imej mesti 5 MB atau lebih kecil.')
  })

  it('uses the authenticated owner as the first private path segment', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'asset-id' })
    const file = new File(['stamp'], 'cop.png', { type: 'image/png' })
    expect(buildCompanyAssetPath('owner-1', 27, 'stamp', file)).toBe('owner-1/27/stamp/asset-id.png')
    vi.unstubAllGlobals()
  })
})
