import type { InvoiceDraft } from './invoice'

const draftPrefix = 'mrpi:invoice-draft:v1'

function draftStorageKey(userId: string, invoiceId: number) {
  return `${draftPrefix}:${userId}:${invoiceId}`
}

export function saveInvoiceDraft(userId: string, invoiceId: number, draft: InvoiceDraft) {
  const savedDraft: InvoiceDraft = { ...draft, saved_at: new Date().toISOString() }
  try {
    localStorage.setItem(draftStorageKey(userId, invoiceId), JSON.stringify(savedDraft))
  } catch {
    return null
  }
  return savedDraft
}

export function readInvoiceDraft(userId: string, invoiceId: number) {
  try {
    const raw = localStorage.getItem(draftStorageKey(userId, invoiceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<InvoiceDraft>
    if (
      parsed.version !== 1
      || parsed.invoice_id !== invoiceId
      || typeof parsed.project_id !== 'number'
      || typeof parsed.invoice_no !== 'string'
      || typeof parsed.invoice_date !== 'string'
      || typeof parsed.title !== 'string'
      || !Array.isArray(parsed.items)
      || typeof parsed.saved_at !== 'string'
    ) return null
    return parsed as InvoiceDraft
  } catch {
    return null
  }
}

export function clearInvoiceDraft(userId: string, invoiceId: number) {
  try {
    localStorage.removeItem(draftStorageKey(userId, invoiceId))
  } catch {
    // Database state remains authoritative if local storage is unavailable.
  }
}
