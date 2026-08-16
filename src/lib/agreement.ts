import type { Database } from '../types/database'

export type ProjectAgreement = Database['public']['Tables']['project_agreements']['Row']
export type ProjectAgreementSnapshot = Database['public']['Tables']['project_agreement_snapshots']['Row']
export type AgreementStatus = 'draft' | 'issued' | 'accepted'
export type AgreementAcceptanceMethod = 'whatsapp' | 'physical' | 'uploaded'

export type AgreementForm = {
  issue_date: string
  title: string
  work_duration_text: string
  client_supplied_items: string
  exclusions: string
  defect_terms: string
  additional_terms: string
}

export type AgreementSnapshotData = {
  agreement: Pick<AgreementForm, keyof AgreementForm> & { agreement_no: string; revision_no: number }
  company: {
    legal_name: string
    trading_name: string | null
    registration_no: string | null
    owner_name: string
    phone: string
    address_line_1: string | null
    address_line_2: string | null
    postcode: string | null
    city: string | null
    state: string
    signature_path: string | null
    stamp_path: string | null
  }
  project: {
    id: number
    project_no: string
    project_name: string
    quotation_no: string
    quotation_revision_no: number
    client_name: string
    client_phone: string
    client_email: string | null
    address_line_1: string
    address_line_2: string | null
    postcode: string | null
    city: string
    state: string
    contract_amount: number
    current_contract_amount: number
    planned_start_date: string | null
    planned_end_date: string | null
  }
  scope: Array<{
    name: string
    sort_order: number
    items: Array<{
      item_name: string
      description: string
      measurement_text: string | null
      unit: string
      quantity: number
      amount: number
      sort_order: number
    }>
  }>
  payment_schedule: {
    title: string
    notes: string
    basis_amount: number
    stages: Array<{
      stage_no: number
      label: string
      description: string
      percentage: number
      amount: number
    }>
  }
}

export const agreementDocumentBucket = 'project-documents'

export function todayAgreementIso() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function defaultAgreementForm(): AgreementForm {
  return {
    issue_date: todayAgreementIso(),
    title: 'PERJANJIAN KERJA UBAH SUAI',
    work_duration_text: '',
    client_supplied_items: '',
    exclusions: '',
    defect_terms: '',
    additional_terms: '',
  }
}

export function agreementFormFromRow(row: ProjectAgreement): AgreementForm {
  return {
    issue_date: row.issue_date,
    title: row.title,
    work_duration_text: row.work_duration_text,
    client_supplied_items: row.client_supplied_items,
    exclusions: row.exclusions,
    defect_terms: row.defect_terms,
    additional_terms: row.additional_terms,
  }
}

export function agreementStatusLabel(status: string) {
  if (status === 'draft') return 'Draf'
  if (status === 'issued') return 'Dikeluarkan'
  if (status === 'accepted') return 'Diterima'
  return status
}

export function agreementStatusTone(status: string) {
  if (status === 'accepted') return 'bg-emerald-100 text-emerald-800'
  if (status === 'issued') return 'bg-blue-100 text-blue-800'
  return 'bg-amber-100 text-amber-800'
}

export function agreementAcceptanceLabel(method: string | null) {
  if (method === 'whatsapp') return 'Pengesahan bertulis WhatsApp'
  if (method === 'physical') return 'Tandatangan fizikal'
  if (method === 'uploaded') return 'Salinan ditandatangani dimuat naik'
  return 'Belum direkod'
}

export function validateAgreementForm(form: AgreementForm) {
  if (!form.title.trim()) return 'Tajuk perjanjian mesti diisi.'
  if (!form.issue_date) return 'Tarikh perjanjian mesti diisi.'
  return null
}

export function validateAgreementDocument(file: File) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) return 'Gunakan fail PDF, JPG, PNG atau WebP.'
  if (file.size > 10 * 1024 * 1024) return 'Saiz fail mestilah 10 MB atau kurang.'
  return null
}

export function buildAgreementDocumentPath(ownerUserId: string, companyId: number, projectId: number, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  return `${ownerUserId}/${companyId}/${projectId}/agreement/${crypto.randomUUID()}.${extension}`
}

export function isAgreementSnapshotData(value: unknown): value is AgreementSnapshotData {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AgreementSnapshotData>
  return Boolean(row.agreement && row.company && row.project && Array.isArray(row.scope) && row.payment_schedule && Array.isArray(row.payment_schedule.stages))
}
