import { beforeEach, describe, expect, it } from 'vitest'
import { emptyVisitForm, type EntryFormValue } from './siteVisit'
import {
  clearSiteVisitEntryDraft,
  clearSiteVisitResume,
  clearVisitSetupDraft,
  readSiteVisitDraftFiles,
  readSiteVisitEntryDraft,
  readSiteVisitResume,
  readVisitSetupDraft,
  saveSiteVisitEntryDraft,
  saveSiteVisitResume,
  saveVisitSetupDraft,
} from './siteVisitDrafts'

describe('site visit local drafts', () => {
  beforeEach(() => localStorage.clear())

  it('keeps setup drafts isolated by authenticated user', () => {
    const form = { ...emptyVisitForm(), client_name: 'Encik Rahman', client_phone: '0123456789' }
    saveVisitSetupDraft('user-1', null, form)

    expect(readVisitSetupDraft('user-1', null)?.value.client_name).toBe('Encik Rahman')
    expect(readVisitSetupDraft('user-2', null)).toBeNull()

    clearVisitSetupDraft('user-1', null)
    expect(readVisitSetupDraft('user-1', null)).toBeNull()
  })

  it('restores the exact workspace and unfinished entry context', () => {
    const entryForm: EntryFormValue = {
      area_id: '7',
      note_text: 'Semak semula kedudukan sinki',
      measurement_text: '12 kaki',
      guide_key: 'tabletop',
      needs_confirmation: true,
    }
    saveSiteVisitEntryDraft('user-1', 44, {
      entry_id: null,
      form: entryForm,
      show_measurement: true,
      show_guides: true,
    })
    saveSiteVisitResume('user-1', {
      mode: 'workspace',
      visit_id: 44,
      selected_area_id: 7,
      entry_open: true,
      entry_id: null,
    })

    expect(readSiteVisitEntryDraft('user-1', 44)?.value).toEqual(expect.objectContaining({ form: entryForm }))
    expect(readSiteVisitResume('user-1')).toEqual(expect.objectContaining({ visit_id: 44, entry_open: true }))

    clearSiteVisitResume('user-1')
    expect(readSiteVisitResume('user-1')).toBeNull()
  })

  it('fails safely when IndexedDB is unavailable', async () => {
    await clearSiteVisitEntryDraft('user-1', 44)
    await expect(readSiteVisitDraftFiles('user-1', 44)).resolves.toEqual([])
  })
})
