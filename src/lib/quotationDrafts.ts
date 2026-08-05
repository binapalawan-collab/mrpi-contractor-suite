import type { QuotationDraft } from './quotation'

const draftPrefix = 'mrpi:quotation-draft:v1'

function draftStorageKey(userId: string, draftId: string) {
  return `${draftPrefix}:${userId}:${draftId}`
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
  } catch {
    // Storage may be unavailable in private browsing; the saved database draft remains valid.
  }
}
