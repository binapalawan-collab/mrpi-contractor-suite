import type { EntryFormValue, VisitFormValue } from './siteVisit'

const storagePrefix = 'mrpi:site-visit:v1'
const draftDatabaseName = 'mrpi-contractor-suite-drafts'
const draftFileStore = 'site-visit-entry-files'

type StoredValue<T> = {
  version: 1
  value: T
  updated_at: string
}

export type SiteVisitResume =
  | {
      mode: 'setup'
      visit_id: number | null
    }
  | {
      mode: 'workspace'
      visit_id: number
      selected_area_id: number | null
      entry_open: boolean
      entry_id: number | null
    }

export type SiteVisitEntryDraft = {
  entry_id: number | null
  form: EntryFormValue
  show_measurement: boolean
  show_guides: boolean
}

type StoredDraftFile = {
  name: string
  type: string
  last_modified: number
  blob: Blob
}

type StoredDraftFiles = {
  key: string
  files: StoredDraftFile[]
  updated_at: string
}

function setupDraftKey(userId: string, visitId: number | null) {
  return `${storagePrefix}:setup:${userId}:${visitId ?? 'new'}`
}

function entryDraftKey(userId: string, visitId: number) {
  return `${storagePrefix}:entry:${userId}:${visitId}`
}

function resumeKey(userId: string) {
  return `${storagePrefix}:resume:${userId}`
}

function browserStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readStoredValue<T>(key: string): StoredValue<T> | null {
  const storage = browserStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredValue<T>>
    if (parsed.version !== 1 || typeof parsed.updated_at !== 'string' || parsed.value === undefined) return null
    return parsed as StoredValue<T>
  } catch {
    return null
  }
}

function saveStoredValue<T>(key: string, value: T) {
  const updatedAt = new Date().toISOString()
  const storage = browserStorage()
  if (!storage) return null

  try {
    storage.setItem(key, JSON.stringify({ version: 1, value, updated_at: updatedAt } satisfies StoredValue<T>))
    return updatedAt
  } catch {
    return null
  }
}

function removeStoredValue(key: string) {
  try {
    browserStorage()?.removeItem(key)
  } catch {
    // A private browsing quota or disabled storage must never break the form.
  }
}

export function readVisitSetupDraft(userId: string, visitId: number | null) {
  return readStoredValue<VisitFormValue>(setupDraftKey(userId, visitId))
}

export function saveVisitSetupDraft(userId: string, visitId: number | null, form: VisitFormValue) {
  return saveStoredValue(setupDraftKey(userId, visitId), form)
}

export function clearVisitSetupDraft(userId: string, visitId: number | null) {
  removeStoredValue(setupDraftKey(userId, visitId))
}

export function readSiteVisitResume(userId: string) {
  return readStoredValue<SiteVisitResume>(resumeKey(userId))?.value ?? null
}

export function saveSiteVisitResume(userId: string, value: SiteVisitResume) {
  return saveStoredValue(resumeKey(userId), value)
}

export function clearSiteVisitResume(userId: string) {
  removeStoredValue(resumeKey(userId))
}

export function readSiteVisitEntryDraft(userId: string, visitId: number) {
  return readStoredValue<SiteVisitEntryDraft>(entryDraftKey(userId, visitId))
}

export function saveSiteVisitEntryDraft(userId: string, visitId: number, value: SiteVisitEntryDraft) {
  return saveStoredValue(entryDraftKey(userId, visitId), value)
}

export async function clearSiteVisitEntryDraft(userId: string, visitId: number) {
  const key = entryDraftKey(userId, visitId)
  removeStoredValue(key)
  await deleteDraftFiles(key)
}

function openDraftDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve<IDBDatabase | null>(null)

  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(draftDatabaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(draftFileStore)) {
          request.result.createObjectStore(draftFileStore, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function finishTransaction(transaction: IDBTransaction) {
  return new Promise<boolean>((resolve) => {
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => resolve(false)
    transaction.onabort = () => resolve(false)
  })
}

export async function saveSiteVisitDraftFiles(userId: string, visitId: number, files: File[]) {
  const database = await openDraftDatabase()
  if (!database) return false

  try {
    const key = entryDraftKey(userId, visitId)
    const transaction = database.transaction(draftFileStore, 'readwrite')
    const store = transaction.objectStore(draftFileStore)
    if (files.length === 0) {
      store.delete(key)
    } else {
      const record: StoredDraftFiles = {
        key,
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
          last_modified: file.lastModified,
          blob: file.slice(0, file.size, file.type),
        })),
        updated_at: new Date().toISOString(),
      }
      store.put(record)
    }
    return await finishTransaction(transaction)
  } catch {
    return false
  } finally {
    database.close()
  }
}

export async function readSiteVisitDraftFiles(userId: string, visitId: number) {
  const database = await openDraftDatabase()
  if (!database) return []

  try {
    const key = entryDraftKey(userId, visitId)
    const transaction = database.transaction(draftFileStore, 'readonly')
    const request = transaction.objectStore(draftFileStore).get(key)
    const record = await new Promise<StoredDraftFiles | null>((resolve) => {
      request.onsuccess = () => resolve((request.result as StoredDraftFiles | undefined) ?? null)
      request.onerror = () => resolve(null)
    })
    return (record?.files ?? []).map((file) => new File([file.blob], file.name, {
      type: file.type,
      lastModified: file.last_modified,
    }))
  } catch {
    return []
  } finally {
    database.close()
  }
}

async function deleteDraftFiles(key: string) {
  const database = await openDraftDatabase()
  if (!database) return false

  try {
    const transaction = database.transaction(draftFileStore, 'readwrite')
    transaction.objectStore(draftFileStore).delete(key)
    return await finishTransaction(transaction)
  } catch {
    return false
  } finally {
    database.close()
  }
}
