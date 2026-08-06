import { beforeEach, describe, expect, it } from 'vitest'
import { blankVariationOrderItem, type VariationOrderDraft } from './variationOrder'
import {
  clearVariationOrderDraft,
  readVariationOrderDraft,
  readVariationOrderItemDraft,
  saveVariationOrderDraft,
  saveVariationOrderItemDraft,
} from './variationOrderDrafts'

function draft(): VariationOrderDraft {
  return {
    version: 1,
    variation_order_id: 7,
    project_id: 3,
    vo_no: 'VO-001',
    vo_date: '2026-08-06',
    title: 'PERUBAHAN KERJA',
    reason: 'Permintaan pelanggan',
    status: 'draft',
    revision_no: 0,
    time_impact_days: '0',
    sections: [],
    saved_at: new Date(0).toISOString(),
  }
}

describe('Variation Order draft persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores a VO after an app switch', () => {
    const current = draft()
    current.reason = 'Catatan yang tidak boleh hilang'
    saveVariationOrderDraft('owner-1', 7, current)
    expect(readVariationOrderDraft('owner-1', 7)?.reason).toBe('Catatan yang tidak boleh hilang')
  })

  it('restores an unfinished VO item editor', () => {
    const item = { ...blankVariationOrderItem(), item_name: 'Tambah mozek porch' }
    saveVariationOrderItemDraft('owner-1', 7, {
      section_local_id: 'section-1',
      item,
      mode: 'manual',
      search: 'mozek',
      category_id: 'all',
    })
    expect(readVariationOrderItemDraft('owner-1', 7)).toMatchObject({
      mode: 'manual',
      search: 'mozek',
      item: { item_name: 'Tambah mozek porch' },
    })
  })

  it('clears the VO and its pending item together', () => {
    saveVariationOrderDraft('owner-1', 7, draft())
    saveVariationOrderItemDraft('owner-1', 7, {
      section_local_id: 'section-1',
      item: blankVariationOrderItem(),
      mode: 'manual',
      search: '',
      category_id: 'all',
    })
    clearVariationOrderDraft('owner-1', 7)
    expect(readVariationOrderDraft('owner-1', 7)).toBeNull()
    expect(readVariationOrderItemDraft('owner-1', 7)).toBeNull()
  })
})
