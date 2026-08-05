import type { Database, Json } from '../types/database'

export type Client = Database['public']['Tables']['clients']['Row']
export type SiteVisit = Database['public']['Tables']['site_visits']['Row']
export type SiteVisitArea = Database['public']['Tables']['site_visit_areas']['Row']
export type SiteVisitEntry = Database['public']['Tables']['site_visit_entries']['Row']
export type SiteVisitPhoto = Database['public']['Tables']['site_visit_photos']['Row']
export type SiteVisitGuide = Database['public']['Tables']['system_site_visit_guides']['Row']

export type VisitFormValue = {
  client_name: string
  client_phone: string
  project_title: string
  visit_date: string
  address_line_1: string
  address_line_2: string
  postcode: string
  city: string
  state: string
}

export type EntryFormValue = {
  area_id: string
  note_text: string
  measurement_text: string
  guide_key: string
}

export const defaultProjectTitle = 'Cadangan Kerja Ubah Suai Rumah'
export const siteVisitPhotoBucket = 'site-visit-photos'
export const acceptedSitePhotoTypes = ['image/jpeg', 'image/png', 'image/webp'] as const
export const maxSitePhotoBytes = 10 * 1024 * 1024

const exactJohorPostcodes: Record<string, string> = {
  '79000': 'Iskandar Puteri',
  '80000': 'Johor Bahru',
  '81000': 'Kulai',
  '82000': 'Pontian',
  '83000': 'Batu Pahat',
  '84000': 'Muar',
  '85000': 'Segamat',
  '85100': 'Batu Anam',
  '85200': 'Jementah',
  '85300': 'Labis',
  '85400': 'Chaah',
  '86000': 'Kluang',
  '86500': 'Bekok',
  '86600': 'Paloh',
  '86700': 'Kahang',
  '86800': 'Mersing',
  '86900': 'Endau',
}

const johorRanges = [
  { start: 79000, end: 79999, city: 'Iskandar Puteri' },
  { start: 80000, end: 81999, city: 'Johor Bahru' },
  { start: 82000, end: 82999, city: 'Pontian' },
  { start: 83000, end: 83999, city: 'Batu Pahat' },
  { start: 84000, end: 84999, city: 'Muar' },
  { start: 85000, end: 85999, city: 'Segamat' },
  { start: 86000, end: 86799, city: 'Kluang' },
  { start: 86800, end: 86999, city: 'Mersing' },
]

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidPhone(value: string) {
  return /^[0-9]{7,15}$/.test(normalizePhone(value))
}

export function lookupJohorPostcode(value: string) {
  const postcode = value.replace(/\D/g, '').slice(0, 5)
  if (postcode.length !== 5) return null

  const exactCity = exactJohorPostcodes[postcode]
  if (exactCity) return { city: exactCity, state: 'Johor' }

  const numericPostcode = Number(postcode)
  const range = johorRanges.find(({ start, end }) => numericPostcode >= start && numericPostcode <= end)
  return range ? { city: range.city, state: 'Johor' } : null
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function emptyVisitForm(): VisitFormValue {
  return {
    client_name: '',
    client_phone: '',
    project_title: defaultProjectTitle,
    visit_date: localDateInputValue(),
    address_line_1: '',
    address_line_2: '',
    postcode: '',
    city: '',
    state: 'Johor',
  }
}

export function visitFormFromRows(visit: SiteVisit, client: Client): VisitFormValue {
  return {
    client_name: client.name,
    client_phone: client.phone,
    project_title: visit.project_title,
    visit_date: visit.visit_date,
    address_line_1: visit.address_line_1,
    address_line_2: visit.address_line_2 ?? '',
    postcode: visit.postcode ?? '',
    city: visit.city,
    state: visit.state,
  }
}

export function nullableTrimmed(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export function guidePrompts(value: Json): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
}

export function validateSitePhoto(file: File) {
  if (!acceptedSitePhotoTypes.includes(file.type as (typeof acceptedSitePhotoTypes)[number])) {
    return 'Gunakan gambar JPG, PNG atau WebP.'
  }
  if (file.size <= 0) return 'Fail gambar kosong.'
  if (file.size > maxSitePhotoBytes) return 'Setiap gambar mestilah 10 MB atau lebih kecil.'
  return null
}

export function buildSitePhotoPath(userId: string, visitId: number, entryId: number, file: File) {
  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  const extension = extensionByType[file.type] ?? 'jpg'
  return `${userId}/${visitId}/${entryId}/${crypto.randomUUID()}.${extension}`
}

export function formatVisitDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('ms-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function visitStatusLabel(status: string) {
  if (status === 'ready_for_quote') return 'Sedia untuk sebutharga'
  if (status === 'converted') return 'Telah jadi sebutharga'
  if (status === 'archived') return 'Diarkibkan'
  return 'Draf'
}
