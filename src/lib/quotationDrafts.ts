import type { QuotationDraft, QuotationDraftItem } from './quotation'

const draftPrefix = 'mrpi:quotation-draft:v1'
const itemDraftPrefix = 'mrpi:quotation-item-draft:v1'

export type QuotationItemEditorDraft = {
  section_local_id: string
  item: QuotationDraftItem
  mode: 'catalog' | 'manual'
  search: string
  category_id: number | 'all'
  source_note: {
    note_text: string
    measurement_text: string | null
  } | null
}

export type StoredQuotationItemEditorDraft = QuotationItemEditorDraft & {
  version: 1
  updated_at: string
}

function draftStorageKey(userId: string, draftId: string) {
  return `${draftPrefix}:${userId}:${draftId}`
}

function itemDraftStorageKey(userId: string, draftId: string) {
  return `${itemDraftPrefix}:${userId}:${draftId}`
}

export function saveQuotationDraft(userId: string, draftId: string, draft: QuotationDraft) {
  const savedDraft = { ...draft, saved_at: new Date().toISOString() }
  try {
    localStorage.setItem(draftStorageKey(userId, draftId), JSON.stringify(savedDraft))
  } catch {
    return null
  }
  return savedDraft
}

export function readQuotationDraft(userId: string, draftId: string) {
  try {
    const raw = localStorage.getItem(draftStorageKey(userId, draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<QuotationDraft>
    if (
      parsed.version !== 1
      || typeof parsed.draft_key !== 'string'
      || typeof parsed.header !== 'object'
      || !Array.isArray(parsed.sections)
    ) return null
    return parsed as QuotationDraft
  } catch {
    return null
  }
}

export function clearQuotationDraft(userId: string, draftId: string) {
  try {
    localStorage.removeItem(draftStorageKey(userId, draftId))
    localStorage.removeItem(itemDraftStorageKey(userId, draftId))
  } catch {
    // Storage may be unavailable in private browsing; the saved database draft remains valid.
  }
}

export function saveQuotationItemDraft(userId: string, draftId: string, draft: QuotationItemEditorDraft) {
  const savedDraft: StoredQuotationItemEditorDraft = {
    ...draft,
    version: 1,
    updated_at: new Date().toISOString(),
  }
  try {
    localStorage.setItem(itemDraftStorageKey(userId, draftId), JSON.stringify(savedDraft))
  } catch {
    return null
  }
  return savedDraft
}

export function readQuotationItemDraft(userId: string, draftId: string) {
  try {
    const raw = localStorage.getItem(itemDraftStorageKey(userId, draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredQuotationItemEditorDraft>
    const validCategory = parsed.category_id === 'all' || typeof parsed.category_id === 'number'
    const validSourceNote = parsed.source_note === null || (
      typeof parsed.source_note === 'object'
      && typeof parsed.source_note.note_text === 'string'
      && (parsed.source_note.measurement_text === null || typeof parsed.source_note.measurement_text === 'string')
    )
    if (
      parsed.version !== 1
      || typeof parsed.updated_at !== 'string'
      || typeof parsed.section_local_id !== 'string'
      || typeof parsed.item !== 'object'
      || typeof parsed.item?.local_id !== 'string'
      || (parsed.mode !== 'catalog' && parsed.mode !== 'manual')
      || typeof parsed.search !== 'string'
      || !validCategory
      || !validSourceNote
    ) return null
    return parsed as StoredQuotationItemEditorDraft
  } catch {
    return null
  }
}

export function clearQuotationItemDraft(userId: string, draftId: string) {
  try {
    localStorage.removeItem(itemDraftStorageKey(userId, draftId))
  } catch {
    // Losing a temporary browser draft must never block the quotation editor.
  }
}
