import { describe, expect, it } from 'vitest'
import { filterCatalogItems, formatRinggitRate, parseCatalogRate, type CatalogItem } from './catalog'

const baseItem: CatalogItem = {
  id: 1,
  company_id: 1,
  owner_user_id: 'owner-1',
  category_id: 10,
  source_item_id: 1,
  imported_master_version: 1,
  code: 'KITCH-001',
  name: 'Tabletop konkrit kemasan mozek',
  description: 'Siap backsplash dua kaki.',
  unit: 'kaki',
  rate: 230,
  price_note: 'Harga standard',
  guide_key: 'tabletop',
  sort_order: 10,
  is_active: true,
  created_at: '2026-08-04T00:00:00Z',
  updated_at: '2026-08-04T00:00:00Z',
}

describe('catalog helpers', () => {
  it('formats a selling rate in Ringgit Malaysia', () => {
    expect(formatRinggitRate(230)).toBe('RM 230.00')
  })

  it('filters by search, category and archive state', () => {
    const archived = { ...baseItem, id: 2, name: 'Item lama', is_active: false }

    expect(filterCatalogItems([baseItem, archived], {
      search: 'backsplash',
      categoryId: 10,
      showArchived: false,
    })).toEqual([baseItem])

    expect(filterCatalogItems([baseItem, archived], {
      search: '',
      categoryId: 'all',
      showArchived: true,
    })).toEqual([archived])
  })

  it('accepts valid non-negative rates only', () => {
    expect(parseCatalogRate('1,250.50')).toBe(1250.5)
    expect(parseCatalogRate('-1')).toBeNull()
    expect(parseCatalogRate('abc')).toBeNull()
  })
})
