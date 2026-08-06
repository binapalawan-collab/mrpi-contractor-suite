import type { Database, Json } from '../types/database'
import type { Project } from './project'
import { formatMoney, localId, parsePositiveNumber } from './quotation'

export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceItem = Database['public']['Tables']['invoice_items']['Row']
export type InvoiceSnapshot = Database['public']['Tables']['invoice_snapshots']['Row']
export type InvoicePayment = Database['public']['Tables']['invoice_payments']['Row']

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
export type InvoiceSourceType = 'progress' | 'approved_variation' | 'manual'
export type PaymentMethod = 'bank_transfer' | 'cash' | 'cheque' | 'card' | 'other'

export type InvoiceDraftItem = {
  local_id: string
  id: number | null
  variation_order_id: number | null
  source_type: InvoiceSourceType
  description: string
  percentage: string
  amount: string
}

export type InvoiceDraft = {
  version: 1
  invoice_id: number
  project_id: number
  invoice_no: string
  invoice_date: string
  due_date: string
  title: string
  notes: string
  status: string
  items: InvoiceDraftItem[]
  saved_at: string
}

export type InvoiceDocumentSnapshot = {
  version: 1
  invoice: {
    invoice_no: string
    invoice_date: string
    due_date: string | null
    title: string
    notes: string
    total_amount: number
    contract_value: number
    previous_billed_amount: number
    contract_balance_after: number
    issued_at: string
  }
  company: {
    legal_name: string
    trading_name: string | null
    registration_no: string | null
    phone: string
    address_line_1: string | null
    address_line_2: string | null
    postcode: string | null
    city: string | null
    state: string
    logo_path: string | null
  }
  project: {
    project_no: string
    project_name: string
    client_name: string
    client_phone: string
    address_line_1: string
    address_line_2: string | null
    postcode: string | null
    city: string
    state: string
  }
  items: Array<{
    source_type: InvoiceSourceType
    variation_order_id: number | null
    description: string
    percentage: number | null
    amount: number
  }>
}

export function invoiceStatusLabel(status: string) {
  if (status === 'issued') return 'Dikeluarkan'
  if (status === 'partially_paid') return 'Bayaran Separa'
  if (status === 'paid') return 'Selesai Dibayar'
  if (status === 'void') return 'Dibatalkan'
  return 'Draf'
}

export function invoiceStatusTone(status: string) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-800'
  if (status === 'partially_paid') return 'bg-blue-100 text-blue-800'
  if (status === 'issued') return 'bg-orange-100 text-orange-800'
  if (status === 'void') return 'bg-slate-200 text-slate-700'
  return 'bg-amber-100 text-amber-800'
}

export function invoiceSourceLabel(sourceType: string) {
  if (sourceType === 'progress') return 'Progress kontrak'
  if (sourceType === 'approved_variation') return 'VO diluluskan'
  return 'Tuntutan manual'
}

export function paymentMethodLabel(method: string) {
  if (method === 'bank_transfer') return 'Pindahan bank'
  if (method === 'cash') return 'Tunai'
  if (method === 'cheque') return 'Cek'
  if (method === 'card') return 'Kad'
  return 'Lain-lain'
}

export function blankInvoiceItem(sourceType: InvoiceSourceType = 'manual'): InvoiceDraftItem {
  return {
    local_id: localId(),
    id: null,
    variation_order_id: null,
    source_type: sourceType,
    description: '',
    percentage: sourceType === 'progress' ? '10' : '',
    amount: '',
  }
}

export function invoiceItemAmount(item: Pick<InvoiceDraftItem, 'amount'>) {
  return parsePositiveNumber(item.amount) ?? 0
}

export function invoiceDraftTotal(draft: Pick<InvoiceDraft, 'items'>) {
  return Math.round(draft.items.reduce((total, item) => total + invoiceItemAmount(item), 0) * 100) / 100
}

export function progressAmount(contractValue: number, percentage: string) {
  const parsed = parsePositiveNumber(percentage)
  if (parsed === null || parsed > 100) return 0
  return Math.round(contractValue * parsed) / 100
}

export function invoiceDraftFromRows(invoice: Invoice, items: InvoiceItem[]): InvoiceDraft {
  return {
    version: 1,
    invoice_id: invoice.id,
    project_id: invoice.project_id,
    invoice_no: invoice.invoice_no,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date ?? '',
    title: invoice.title,
    notes: invoice.notes,
    status: invoice.status,
    items: items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((item) => ({
        local_id: `invoice-item-${item.id}`,
        id: item.id,
        variation_order_id: item.variation_order_id,
        source_type: isInvoiceSourceType(item.source_type) ? item.source_type : 'manual',
        description: item.description,
        percentage: item.percentage === null ? '' : String(item.percentage),
        amount: Number(item.amount).toFixed(2),
      })),
    saved_at: invoice.updated_at,
  }
}

export function validateInvoiceDraft(draft: InvoiceDraft) {
  if (!draft.invoice_date) return 'Tarikh invois mesti diisi.'
  if (draft.due_date && draft.due_date < draft.invoice_date) return 'Tarikh akhir bayaran tidak boleh lebih awal daripada tarikh invois.'
  if (!draft.title.trim()) return 'Tajuk invois mesti diisi.'
  if (!draft.items.length) return 'Tambah sekurang-kurangnya satu tuntutan.'
  for (const item of draft.items) {
    if (!item.description.trim()) return 'Keterangan setiap tuntutan mesti diisi.'
    if (invoiceItemAmount(item) <= 0) return 'Jumlah setiap tuntutan mesti lebih besar daripada sifar.'
    if (item.source_type === 'progress') {
      const percentage = parsePositiveNumber(item.percentage)
      if (percentage === null || percentage > 100) return 'Peratus progress mesti antara 0.001% hingga 100%.'
    }
    if (item.source_type === 'approved_variation' && !item.variation_order_id) return 'Pilih Variation Order yang telah diluluskan.'
  }
  return null
}

export function projectInvoiceTotals(invoices: Invoice[]) {
  return invoices.reduce(
    (totals, invoice) => {
      if (invoice.status === 'draft' || invoice.status === 'void') return totals
      totals.billed += Number(invoice.total_amount)
      totals.paid += Number(invoice.paid_amount)
      totals.outstanding += Number(invoice.balance_amount)
      return totals
    },
    { billed: 0, paid: 0, outstanding: 0 },
  )
}

export function isInvoiceOverdue(invoice: Pick<Invoice, 'status' | 'due_date' | 'balance_amount'>, today = todayIso()) {
  return Boolean(
    invoice.due_date
    && invoice.due_date < today
    && Number(invoice.balance_amount) > 0
    && (invoice.status === 'issued' || invoice.status === 'partially_paid'),
  )
}

export function buildInvoiceWhatsAppText(invoice: Invoice, project: Project) {
  const lines = [
    `Salam ${project.client_name},`,
    '',
    `${invoice.invoice_no} — ${invoice.title}`,
    `Projek: ${project.project_no}`,
    `Jumlah invois: ${formatMoney(Number(invoice.total_amount))}`,
  ]
  if (Number(invoice.paid_amount) > 0) lines.push(`Telah dibayar: ${formatMoney(Number(invoice.paid_amount))}`)
  lines.push(`Baki: ${formatMoney(Number(invoice.balance_amount))}`)
  if (invoice.due_date) lines.push(`Tarikh akhir bayaran: ${formatInvoiceDate(invoice.due_date)}`)
  lines.push('', 'PDF invois boleh dilampirkan bersama mesej ini. Terima kasih.')
  return lines.join('\n')
}

export function formatInvoiceDate(value: string | null) {
  if (!value) return 'Tidak ditetapkan'
  const [year = 1970, month = 1, day = 1] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function todayIso() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseInvoiceSnapshot(value: Json): InvoiceDocumentSnapshot | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !isRecord(candidate.invoice) || !isRecord(candidate.company) || !isRecord(candidate.project) || !Array.isArray(candidate.items)) return null
  return value as unknown as InvoiceDocumentSnapshot
}

function isInvoiceSourceType(value: string): value is InvoiceSourceType {
  return value === 'progress' || value === 'approved_variation' || value === 'manual'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
