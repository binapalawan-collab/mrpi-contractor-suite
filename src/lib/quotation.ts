import type { Database, Json } from '../types/database'

export type Quotation = Database['public']['Tables']['quotations']['Row']
export type QuotationSection = Database['public']['Tables']['quotation_sections']['Row']
export type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
export type QuotationSnapshot = Database['public']['Tables']['quotation_snapshots']['Row']
export type QuotationLanguage = 'ms' | 'en'
export type CalculationMethod = 'area' | 'length' | 'qty' | 'lsum'

export type QuotationDraftHeader = {
  quotation_no: string
  quotation_date: string
  language: QuotationLanguage
  client_id: number | null
  client_name: string
  client_phone: string
  client_email: string
  project_title: string
  address_line_1: string
  address_line_2: string
  postcode: string
  city: string
  state: string
  validity_days: string
  notes: string
}

export type QuotationDraftItem = {
  local_id: string
  id: number | null
  catalog_item_id: number | null
  source_site_visit_id: number | null
  source_site_visit_area_id: number | null
  source_site_visit_entry_id: number | null
  item_name: string
  description: string
  measurement_text: string
  calculation_method: CalculationMethod
  unit: string
  quantity: string
  rate: string
}

export type QuotationDraftSection = {
  local_id: string
  id: number | null
  source_site_visit_id: number | null
  source_site_visit_area_id: number | null
  name: string
  items: QuotationDraftItem[]
}

export type QuotationDraft = {
  version: 1
  draft_key: string
  quotation_id: number | null
  source_site_visit_id: number | null
  status: string
  revision_no: number
  header: QuotationDraftHeader
  sections: QuotationDraftSection[]
  saved_at: string
}

const moneyFormatter = new Intl.NumberFormat('ms-MY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function localId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function todayInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createEmptyQuotationDraft(): QuotationDraft {
  return {
    version: 1,
    draft_key: localId(),
    quotation_id: null,
    source_site_visit_id: null,
    status: 'draft',
    revision_no: 0,
    header: {
      quotation_no: '',
      quotation_date: todayInputValue(),
      language: 'ms',
      client_id: null,
      client_name: '',
      client_phone: '',
      client_email: '',
      project_title: '',
      address_line_1: '',
      address_line_2: '',
      postcode: '',
      city: '',
      state: 'Johor',
      validity_days: '30',
      notes: '',
    },
    sections: [],
    saved_at: new Date().toISOString(),
  }
}

export function buildProjectTitle(language: QuotationLanguage, address: string) {
  const place = address.trim()
  if (language === 'en') return place ? `PROPOSED RENOVATION WORKS AT ${place}` : 'PROPOSED RENOVATION WORKS'
  return place ? `CADANGAN KERJA UBAH SUAI DI ${place}` : 'CADANGAN KERJA UBAH SUAI'
}

export function parseNonNegativeNumber(value: string) {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function parsePositiveNumber(value: string) {
  const parsed = parseNonNegativeNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

export function quotationItemAmount(item: Pick<QuotationDraftItem, 'quantity' | 'rate'>) {
  const quantity = parsePositiveNumber(item.quantity)
  const rate = parseNonNegativeNumber(item.rate)
  if (quantity === null || rate === null) return 0
  return Math.round(quantity * rate * 100) / 100
}

export function quotationSectionTotal(section: Pick<QuotationDraftSection, 'items'>) {
  return Math.round(section.items.reduce(
    (total, item) => total + quotationItemAmount(item),
    0,
  ) * 100) / 100
}

export function quotationStoredItemsTotal(items: Array<Pick<QuotationItem, 'amount' | 'quantity' | 'rate'>>) {
  return Math.round(items.reduce(
    (total, item) => total + Number(item.amount ?? Number(item.quantity) * Number(item.rate)),
    0,
  ) * 100) / 100
}

export function quotationDraftTotal(draft: Pick<QuotationDraft, 'sections'>) {
  return Math.round(draft.sections.reduce(
    (total, section) => total + quotationSectionTotal(section),
    0,
  ) * 100) / 100
}

export function formatMoney(value: number) {
  return `RM ${moneyFormatter.format(value)}`
}

export function formatQuotationNumber(quotationNo: string, revisionNo: number) {
  return revisionNo > 0 ? `${quotationNo}/R${revisionNo}` : quotationNo
}

export function quotationStatusLabel(status: string) {
  if (status === 'sent') return 'Telah dihantar'
  if (status === 'accepted') return 'Diterima'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'expired') return 'Tamat tempoh'
  if (status === 'archived') return 'Diarkibkan'
  return 'Draf'
}

export function calculationMethodLabel(method: CalculationMethod, language: QuotationLanguage = 'ms') {
  const labels = language === 'en'
    ? { area: 'Area', length: 'Length', qty: 'Quantity', lsum: 'Lump Sum' }
    : { area: 'Keluasan', length: 'Panjang', qty: 'Kuantiti', lsum: 'Lump Sum' }
  return labels[method]
}

export function quotationDraftFromRows(
  quotation: Quotation,
  sections: QuotationSection[],
  items: QuotationItem[],
): QuotationDraft {
  return {
    version: 1,
    draft_key: quotation.draft_key,
    quotation_id: quotation.id,
    source_site_visit_id: quotation.site_visit_id,
    status: quotation.status,
    revision_no: quotation.revision_no,
    header: {
      quotation_no: quotation.quotation_no,
      quotation_date: quotation.quotation_date,
      language: quotation.language === 'en' ? 'en' : 'ms',
      client_id: quotation.client_id,
      client_name: quotation.client_name,
      client_phone: quotation.client_phone,
      client_email: quotation.client_email ?? '',
      project_title: quotation.project_title,
      address_line_1: quotation.address_line_1,
      address_line_2: quotation.address_line_2 ?? '',
      postcode: quotation.postcode ?? '',
      city: quotation.city,
      state: quotation.state,
      validity_days: String(quotation.validity_days),
      notes: quotation.notes ?? '',
    },
    sections: sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((section) => ({
        local_id: `section-${section.id}`,
        id: section.id,
        source_site_visit_id: section.source_site_visit_id,
        source_site_visit_area_id: section.source_site_visit_area_id,
        name: section.name,
        items: items
          .filter((item) => item.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          .map((item) => ({
            local_id: `item-${item.id}`,
            id: item.id,
            catalog_item_id: item.catalog_item_id,
            source_site_visit_id: item.source_site_visit_id,
            source_site_visit_area_id: item.source_site_visit_area_id,
            source_site_visit_entry_id: item.source_site_visit_entry_id,
            item_name: item.item_name,
            description: item.description,
            measurement_text: item.measurement_text ?? '',
            calculation_method: isCalculationMethod(item.calculation_method) ? item.calculation_method : 'qty',
            unit: item.unit,
            quantity: String(item.quantity),
            rate: Number(item.rate).toFixed(2),
          })),
      })),
    saved_at: quotation.updated_at,
  }
}

export function buildWhatsAppText(draft: QuotationDraft) {
  const english = draft.header.language === 'en'
  const number = draft.header.quotation_no
    ? formatQuotationNumber(draft.header.quotation_no, draft.revision_no)
    : english ? 'Draft quotation' : 'Draf sebutharga'
  const total = formatMoney(quotationDraftTotal(draft))
  const lines = english
    ? [
        `Hello ${draft.header.client_name},`,
        '',
        `${number} — ${draft.header.project_title}`,
        `Total: ${total}`,
        `Valid for ${draft.header.validity_days || '30'} days.`,
        '',
        'The detailed PDF can be attached to this WhatsApp message.',
      ]
    : [
        `Salam ${draft.header.client_name},`,
        '',
        `${number} — ${draft.header.project_title}`,
        `Jumlah: ${total}`,
        `Sah selama ${draft.header.validity_days || '30'} hari.`,
        '',
        'PDF terperinci boleh dilampirkan bersama mesej WhatsApp ini.',
      ]
  return lines.join('\n')
}

export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('60')) return digits
  if (digits.startsWith('0')) return `60${digits.slice(1)}`
  return digits
}

export function quotationSnapshotData(draft: QuotationDraft): Json {
  return {
    quotation_id: draft.quotation_id,
    draft_key: draft.draft_key,
    revision_no: draft.revision_no,
    header: draft.header,
    sections: draft.sections.map((section) => ({
      name: section.name,
      source_site_visit_area_id: section.source_site_visit_area_id,
      items: section.items.map((item) => ({
        catalog_item_id: item.catalog_item_id,
        source_site_visit_entry_id: item.source_site_visit_entry_id,
        item_name: item.item_name,
        description: item.description,
        measurement_text: item.measurement_text,
        calculation_method: item.calculation_method,
        unit: item.unit,
        quantity: parsePositiveNumber(item.quantity) ?? 0,
        rate: parseNonNegativeNumber(item.rate) ?? 0,
        amount: quotationItemAmount(item),
      })),
    })),
    total_amount: quotationDraftTotal(draft),
  }
}

function isCalculationMethod(value: string): value is CalculationMethod {
  return value === 'area' || value === 'length' || value === 'qty' || value === 'lsum'
}
