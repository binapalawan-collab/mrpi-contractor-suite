import type { VariationOrderDraft, VariationOrderDraftItem } from './variationOrder'

const draftPrefix = 'mrpi:variation-order-draft:v1'
const itemDraftPrefix = 'mrpi:variation-order-item-draft:v1'

export type VariationOrderItemEditorDraft = {
  section_local_id: string
  item: VariationOrderDraftItem
  mode: 'baseline' | 'catalog' | 'manual'
  search: string
  category_id: number | 'all'
}

export type StoredVariationOrderItemEditorDraft = VariationOrderItemEditorDraft & {
  version: 1
  updated_at: string
}

function draftStorageKey(userId: string, variationOrderId: number) {
  return `${draftPrefix}:${userId}:${variationOrderId}`
}

function itemDraftStorageKey(userId: string, variationOrderId: number) {
  return `${itemDraftPrefix}:${userId}:${variationOrderId}`
}

export function saveVariationOrderDraft(userId: string, variationOrderId: number, draft: VariationOrderDraft) {
  const savedDraft = { ...draft, saved_at: new Date().toISOString() }
  try {
    localStorage.setItem(draftStorageKey(userId, variationOrderId), JSON.stringify(savedDraft))
  } catch {
    return null
  }
  return savedDraft
}

export function readVariationOrderDraft(userId: string, variationOrderId: number) {
  try {
    const raw = localStorage.getItem(draftStorageKey(userId, variationOrderId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VariationOrderDraft>
    if (
      parsed.version !== 1
      || parsed.variation_order_id !== variationOrderId
      || typeof parsed.project_id !== 'number'
      || typeof parsed.vo_no !== 'string'
      || !Array.isArray(parsed.sections)
    ) return null
    return parsed as VariationOrderDraft
  } catch {
    return null
  }
}

export function clearVariationOrderDraft(userId: string, variationOrderId: number) {
  try {
    localStorage.removeItem(draftStorageKey(userId, variationOrderId))
    localStorage.removeItem(itemDraftStorageKey(userId, variationOrderId))
  } catch {
    // Local storage may be unavailable; the database draft remains valid.
  }
}

export function saveVariationOrderItemDraft(userId: string, variationOrderId: number, draft: VariationOrderItemEditorDraft) {
  const savedDraft: StoredVariationOrderItemEditorDraft = {
    ...draft,
    version: 1,
    updated_at: new Date().toISOString(),
  }
  try {
    localStorage.setItem(itemDraftStorageKey(userId, variationOrderId), JSON.stringify(savedDraft))
  } catch {
    return null
  }
  return savedDraft
}

export function readVariationOrderItemDraft(userId: string, variationOrderId: number) {
  try {
    const raw = localStorage.getItem(itemDraftStorageKey(userId, variationOrderId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredVariationOrderItemEditorDraft>
    const validMode = parsed.mode === 'baseline' || parsed.mode === 'catalog' || parsed.mode === 'manual'
    const validCategory = parsed.category_id === 'all' || typeof parsed.category_id === 'number'
    if (
      parsed.version !== 1
      || typeof parsed.updated_at !== 'string'
      || typeof parsed.section_local_id !== 'string'
      || typeof parsed.item !== 'object'
      || typeof parsed.item?.local_id !== 'string'
      || !validMode
      || typeof parsed.search !== 'string'
      || !validCategory
    ) return null
    return parsed as StoredVariationOrderItemEditorDraft
  } catch {
    return null
  }
}

export function clearVariationOrderItemDraft(userId: string, variationOrderId: number) {
  try {
    localStorage.removeItem(itemDraftStorageKey(userId, variationOrderId))
  } catch {
    // Losing an item composer draft must never block the VO editor.
  }
}
