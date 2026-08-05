export const companyAssetBucket = 'company-assets'
export const companyAssetMaxBytes = 5 * 1024 * 1024

export type CompanyAssetKind = 'signature' | 'stamp'

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function companyAssetLabel(kind: CompanyAssetKind) {
  return kind === 'signature' ? 'Tandatangan' : 'Cop syarikat'
}

export function validateCompanyAsset(file: File) {
  if (!file.size) return 'Fail imej kosong.'
  if (!extensionByMimeType[file.type]) return 'Gunakan imej JPG, PNG atau WebP.'
  if (file.size > companyAssetMaxBytes) return 'Saiz imej mesti 5 MB atau lebih kecil.'
  return null
}

export function buildCompanyAssetPath(
  userId: string,
  companyId: number,
  kind: CompanyAssetKind,
  file: File,
) {
  const extension = extensionByMimeType[file.type]
  if (!userId || !Number.isInteger(companyId) || companyId <= 0 || !extension) {
    throw new Error('Laluan aset syarikat tidak sah.')
  }
  const objectId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${userId}/${companyId}/${kind}/${objectId}.${extension}`
}
