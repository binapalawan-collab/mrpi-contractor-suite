import type { Database } from '../types/database'

export type CatalogItem = Database['public']['Tables']['company_catalog_items']['Row']
export type CatalogCategory = Database['public']['Tables']['company_catalog_categories']['Row']

type CatalogFilter = {
  search: string
  categoryId: number | 'all'
  showArchived: boolean
}

const ringgitFormatter = new Intl.NumberFormat('ms-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatRinggitRate(value: number) {
  return ringgitFormatter.format(value).replace('MYR', 'RM')
}

export function parseCatalogRate(value: string) {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function filterCatalogItems(items: CatalogItem[], filter: CatalogFilter) {
  const query = filter.search.trim().toLocaleLowerCase('ms-MY')

  return items.filter((item) => {
    if (item.is_active === filter.showArchived) return false
    if (filter.categoryId !== 'all' && item.category_id !== filter.categoryId) return false
    if (!query) return true

    return [item.code, item.name, item.description, item.unit, item.price_note]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase('ms-MY').includes(query))
  })
}
