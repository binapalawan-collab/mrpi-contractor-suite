import type { CatalogItem } from './catalog'
import type { Project, ProjectItem } from './project'
import {
  formatMoney,
  localId,
  parseNonNegativeNumber,
  parsePositiveNumber,
  type CalculationMethod,
} from './quotation'
import type { Database } from '../types/database'

export type VariationOrder = Database['public']['Tables']['variation_orders']['Row']
export type VariationOrderSection = Database['public']['Tables']['variation_order_sections']['Row']
export type VariationOrderItem = Database['public']['Tables']['variation_order_items']['Row']
export type VariationOrderSnapshot = Database['public']['Tables']['variation_order_snapshots']['Row']

export type VariationOrderStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'archived'
export type VariationDirection = 'add' | 'deduct'
export type VariationChangeType = 'addition' | 'omission' | 'replacement' | 'specification' | 'discount'
export type ApprovalMethod = 'whatsapp' | 'verbal' | 'written' | 'other'

export type VariationOrderDraftItem = {
  local_id: string
  id: number | null
  catalog_item_id: number | null
  source_project_item_id: number | null
  change_type: VariationChangeType
  direction: VariationDirection
  item_name: string
  description: string
  measurement_text: string
  calculation_method: CalculationMethod
  unit: string
  quantity: string
  rate: string
}

export type VariationOrderDraftSection = {
  local_id: string
  id: number | null
  source_project_section_id: number | null
  name: string
  items: VariationOrderDraftItem[]
}

export type VariationOrderDraft = {
  version: 1
  variation_order_id: number
  project_id: number
  vo_no: string
  vo_date: string
  title: string
  reason: string
  status: string
  revision_no: number
  time_impact_days: string
  sections: VariationOrderDraftSection[]
  saved_at: string
}

export function isVariationOrderStatus(value: string): value is VariationOrderStatus {
  return value === 'draft' || value === 'sent' || value === 'approved' || value === 'rejected' || value === 'archived'
}

export function variationOrderStatusLabel(status: string) {
  if (status === 'sent') return 'Dihantar'
  if (status === 'approved') return 'Diluluskan'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'archived') return 'Diarkibkan'
  return 'Draf'
}

export function variationOrderStatusTone(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800'
  if (status === 'rejected' || status === 'archived') return 'bg-slate-200 text-slate-800'
  if (status === 'sent') return 'bg-blue-100 text-blue-800'
  return 'bg-amber-100 text-amber-800'
}

export function variationOrderNumber(voNo: string, revisionNo: number) {
  return revisionNo > 0 ? `${voNo}/R${revisionNo}` : voNo
}

export function variationChangeTypeLabel(changeType: string) {
  if (changeType === 'omission') return 'Pengurangan'
  if (changeType === 'replacement') return 'Penggantian'
  if (changeType === 'specification') return 'Perubahan Spesifikasi'
  if (changeType === 'discount') return 'Diskaun'
  return 'Tambahan'
}

export function approvalMethodLabel(method: string | null) {
  if (method === 'verbal') return 'Persetujuan lisan'
  if (method === 'written') return 'Dokumen bertulis'
  if (method === 'other') return 'Kaedah lain'
  if (method === 'whatsapp') return 'WhatsApp'
  return 'Belum direkodkan'
}

export function blankVariationOrderItem(): VariationOrderDraftItem {
  return {
    local_id: localId(),
    id: null,
    catalog_item_id: null,
    source_project_item_id: null,
    change_type: 'addition',
    direction: 'add',
    item_name: '',
    description: '',
    measurement_text: '',
    calculation_method: 'qty',
    unit: 'unit',
    quantity: '1',
    rate: '0.00',
  }
}

export function variationItemFromCatalog(catalogItem: CatalogItem): VariationOrderDraftItem {
  const method = calculationMethodFromUnit(catalogItem.unit)
  return {
    ...blankVariationOrderItem(),
    catalog_item_id: catalogItem.id,
    item_name: catalogItem.name,
    description: catalogItem.description,
    calculation_method: method,
    unit: method === 'lsum' ? 'L/SUM' : catalogItem.unit,
    rate: Number(catalogItem.rate).toFixed(2),
  }
}

export function variationItemFromProject(item: ProjectItem): VariationOrderDraftItem {
  return {
    ...blankVariationOrderItem(),
    source_project_item_id: item.id,
    change_type: 'omission',
    direction: 'deduct',
    item_name: item.item_name,
    description: item.description,
    measurement_text: item.measurement_text ?? '',
    calculation_method: isCalculationMethod(item.calculation_method) ? item.calculation_method : 'qty',
    unit: item.unit,
    quantity: String(item.quantity),
    rate: Number(item.rate).toFixed(2),
  }
}

export function variationOrderItemAmount(item: Pick<VariationOrderDraftItem, 'quantity' | 'rate' | 'direction'>) {
  const quantity = parsePositiveNumber(item.quantity)
  const rate = parseNonNegativeNumber(item.rate)
  if (quantity === null || rate === null) return 0
  const amount = Math.round(quantity * rate * 100) / 100
  return item.direction === 'deduct' ? -amount : amount
}

export function variationOrderDraftTotal(draft: Pick<VariationOrderDraft, 'sections'>) {
  return draft.sections.reduce(
    (total, section) => total + section.items.reduce((sectionTotal, item) => sectionTotal + variationOrderItemAmount(item), 0),
    0,
  )
}

export function formatSignedMoney(value: number) {
  if (value < 0) return `− ${formatMoney(Math.abs(value))}`
  if (value > 0) return `+ ${formatMoney(value)}`
  return formatMoney(0)
}

export function variationOrderDraftFromRows(
  variationOrder: VariationOrder,
  sections: VariationOrderSection[],
  items: VariationOrderItem[],
): VariationOrderDraft {
  return {
    version: 1,
    variation_order_id: variationOrder.id,
    project_id: variationOrder.project_id,
    vo_no: variationOrder.vo_no,
    vo_date: variationOrder.vo_date,
    title: variationOrder.title,
    reason: variationOrder.reason,
    status: variationOrder.status,
    revision_no: variationOrder.revision_no,
    time_impact_days: String(variationOrder.time_impact_days),
    sections: sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((section) => ({
        local_id: `vo-section-${section.id}`,
        id: section.id,
        source_project_section_id: section.source_project_section_id,
        name: section.name,
        items: items
          .filter((item) => item.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          .map((item) => ({
            local_id: `vo-item-${item.id}`,
            id: item.id,
            catalog_item_id: item.catalog_item_id,
            source_project_item_id: item.source_project_item_id,
            change_type: isVariationChangeType(item.change_type) ? item.change_type : 'addition',
            direction: item.direction === 'deduct' ? 'deduct' : 'add',
            item_name: item.item_name,
            description: item.description,
            measurement_text: item.measurement_text ?? '',
            calculation_method: isCalculationMethod(item.calculation_method) ? item.calculation_method : 'qty',
            unit: item.unit,
            quantity: String(item.quantity),
            rate: Number(item.rate).toFixed(2),
          })),
      })),
    saved_at: variationOrder.updated_at,
  }
}

export function buildVariationOrderWhatsAppText(draft: VariationOrderDraft, project: Project) {
  const net = variationOrderDraftTotal(draft)
  const currentContract = Number(project.current_contract_amount)
  const afterVo = draft.status === 'approved' ? currentContract : currentContract + net
  const contractLabel = draft.status === 'approved' ? 'Nilai kontrak semasa' : 'Nilai kontrak jika diluluskan'
  const timeImpact = Number(draft.time_impact_days) || 0
  const lines = [
    `Salam ${project.client_name},`,
    '',
    `${variationOrderNumber(draft.vo_no, draft.revision_no)} — ${draft.title}`,
    `Projek: ${project.project_no}`,
    `Nilai perubahan bersih: ${formatSignedMoney(net)}`,
    `${contractLabel}: ${formatMoney(afterVo)}`,
  ]
  if (timeImpact !== 0) lines.push(`Kesan masa: ${timeImpact > 0 ? '+' : ''}${timeImpact} hari`)
  lines.push('', 'PDF Variation Order terperinci boleh dilampirkan bersama mesej ini.')
  return lines.join('\n')
}

function calculationMethodFromUnit(unit: string): CalculationMethod {
  const normalized = unit.toLocaleLowerCase('ms-MY')
  if (normalized === 'kps' || normalized.includes('m²')) return 'area'
  if (normalized === 'kaki' || normalized === 'meter' || normalized === 'm') return 'length'
  if (normalized === 'lot' || normalized === 'l/sum' || normalized === 'lsum') return 'lsum'
  return 'qty'
}

function isCalculationMethod(value: string): value is CalculationMethod {
  return value === 'area' || value === 'length' || value === 'qty' || value === 'lsum'
}

function isVariationChangeType(value: string): value is VariationChangeType {
  return value === 'addition' || value === 'omission' || value === 'replacement' || value === 'specification' || value === 'discount'
}
