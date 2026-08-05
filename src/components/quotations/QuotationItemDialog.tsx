import { BookOpenText, Calculator, Check, Search, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { CatalogCategory, CatalogItem } from '../../lib/catalog'
import {
  calculationMethodLabel,
  formatMoney,
  localId,
  parseNonNegativeNumber,
  parsePositiveNumber,
  quotationItemAmount,
  type CalculationMethod,
  type QuotationDraftItem,
} from '../../lib/quotation'

type SourceNote = {
  note_text: string
  measurement_text: string | null
}

type Props = {
  categories: CatalogCategory[]
  catalogItems: CatalogItem[]
  initialItem: QuotationDraftItem | null
  sourceNote: SourceNote | null
  onClose: () => void
  onSave: (item: QuotationDraftItem) => void
}

function calculationMethodFromUnit(unit: string): CalculationMethod {
  const normalized = unit.toLocaleLowerCase('ms-MY')
  if (normalized === 'kps' || normalized.includes('m²')) return 'area'
  if (normalized === 'kaki' || normalized === 'meter' || normalized === 'm') return 'length'
  if (normalized === 'lot' || normalized === 'l/sum' || normalized === 'lsum') return 'lsum'
  return 'qty'
}

function blankItem(sourceNote: SourceNote | null): QuotationDraftItem {
  const measurement = [sourceNote?.note_text, sourceNote?.measurement_text].filter(Boolean).join(' · ')
  return {
    local_id: localId(),
    id: null,
    catalog_item_id: null,
    source_site_visit_id: null,
    source_site_visit_area_id: null,
    source_site_visit_entry_id: null,
    item_name: '',
    description: '',
    measurement_text: measurement,
    calculation_method: 'qty',
    unit: 'unit',
    quantity: '1',
    rate: '0.00',
  }
}

export function QuotationItemDialog({ categories, catalogItems, initialItem, sourceNote, onClose, onSave }: Props) {
  const [item, setItem] = useState<QuotationDraftItem>(() => initialItem ?? blankItem(sourceNote))
  const [mode, setMode] = useState<'catalog' | 'manual'>(() => initialItem?.catalog_item_id ? 'catalog' : 'catalog')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [error, setError] = useState('')

  const categoryNameMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const visibleCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ms-MY')
    return catalogItems
      .filter((catalogItem) => catalogItem.is_active)
      .filter((catalogItem) => categoryId === 'all' || catalogItem.category_id === categoryId)
      .filter((catalogItem) => !query || [catalogItem.name, catalogItem.description, catalogItem.code, catalogItem.unit]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('ms-MY').includes(query)))
      .slice(0, 40)
  }, [catalogItems, categoryId, search])

  function update<K extends keyof QuotationDraftItem>(key: K, value: QuotationDraftItem[K]) {
    setItem((current) => ({ ...current, [key]: value }))
  }

  function chooseCatalogItem(catalogItem: CatalogItem) {
    const method = calculationMethodFromUnit(catalogItem.unit)
    setItem((current) => ({
      ...current,
      catalog_item_id: catalogItem.id,
      item_name: catalogItem.name,
      description: catalogItem.description,
      calculation_method: method,
      unit: method === 'lsum' ? 'L/SUM' : catalogItem.unit,
      quantity: method === 'lsum' ? '1' : current.quantity || '1',
      rate: Number(catalogItem.rate).toFixed(2),
    }))
    setMode('manual')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const quantity = parsePositiveNumber(item.quantity)
    const rate = parseNonNegativeNumber(item.rate)
    if (!item.item_name.trim() || !item.description.trim() || !item.unit.trim()) {
      setError('Nama, keterangan dan unit item mesti diisi.')
      return
    }
    if (quantity === null) {
      setError('Kuantiti mesti nombor lebih besar daripada sifar.')
      return
    }
    if (rate === null) {
      setError('Kadar mesti nombor sifar atau lebih besar.')
      return
    }
    onSave({
      ...item,
      item_name: item.item_name.trim(),
      description: item.description.trim(),
      measurement_text: item.measurement_text.trim(),
      unit: item.unit.trim(),
      quantity: String(quantity),
      rate: rate.toFixed(2),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="quote-item-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold text-amber-700">Item sebutharga</p>
            <h2 id="quote-item-title" className="mt-1 text-xl font-black">{initialItem ? 'Edit item' : 'Tambah item'}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {sourceNote && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                <p className="font-black">Rujukan catatan tapak</p>
                <p className="mt-1">{sourceNote.note_text}</p>
                {sourceNote.measurement_text && <p className="mt-1 font-semibold">Ukuran: {sourceNote.measurement_text}</p>}
                <p className="mt-2 text-xs font-bold">Catatan ini tidak memilih item atau harga secara automatik.</p>
              </div>
            )}

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              <button type="button" onClick={() => setMode('catalog')} className={`min-h-11 rounded-xl text-sm font-black ${mode === 'catalog' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                Pilih Katalog
              </button>
              <button type="button" onClick={() => { setMode('manual'); if (!initialItem) setItem((current) => ({ ...current, catalog_item_id: null })) }} className={`min-h-11 rounded-xl text-sm font-black ${mode === 'manual' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                Isi / Edit Manual
              </button>
            </div>

            {mode === 'catalog' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder="Cari item katalog..." autoFocus />
                </div>
                <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
                  <div className="flex w-max gap-2">
                    <button type="button" onClick={() => setCategoryId('all')} className={`min-h-10 rounded-full px-4 text-xs font-black ${categoryId === 'all' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Semua</button>
                    {categories.filter((category) => category.is_active).map((category) => (
                      <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`min-h-10 rounded-full px-4 text-xs font-black ${categoryId === category.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{category.name}</button>
                    ))}
                  </div>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {visibleCatalog.map((catalogItem) => (
                    <button key={catalogItem.id} type="button" onClick={() => chooseCatalogItem(catalogItem)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-left hover:border-amber-300 hover:bg-amber-50">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><BookOpenText className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{categoryNameMap.get(catalogItem.category_id) ?? 'Katalog'}</p>
                        <p className="mt-1 font-black leading-5 text-slate-950">{catalogItem.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{catalogItem.description}</p>
                        <p className="mt-2 text-xs font-black text-slate-700">{formatMoney(catalogItem.rate)} / {catalogItem.unit}</p>
                      </div>
                      <Check className={`mt-2 h-5 w-5 shrink-0 ${item.catalog_item_id === catalogItem.id ? 'text-emerald-600' : 'text-slate-200'}`} />
                    </button>
                  ))}
                  {!visibleCatalog.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Tiada item ditemui. Ubah carian atau pilih Isi Manual.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {item.catalog_item_id && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Item katalog dipilih. Semua butiran masih boleh diubah untuk quote ini sahaja.</p>}
                <label className="block">
                  <span className="field-label">Nama item <span className="text-red-600">*</span></span>
                  <input required value={item.item_name} onChange={(event) => update('item_name', event.target.value)} className="field-control" placeholder="Contoh: Tabletop konkrit" />
                </label>
                <label className="block">
                  <span className="field-label">Keterangan <span className="text-red-600">*</span></span>
                  <textarea required value={item.description} onChange={(event) => update('description', event.target.value)} className="field-control" placeholder="Ayat penuh yang akan dicetak dalam PDF." />
                </label>
                <label className="block">
                  <span className="field-label">Ukuran / rujukan tapak</span>
                  <textarea value={item.measurement_text} onChange={(event) => update('measurement_text', event.target.value)} className="field-control min-h-20" placeholder="Pilihan. Contoh: 12 kaki × 8 kaki" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Cara kira</span>
                    <select value={item.calculation_method} onChange={(event) => {
                      const method = event.target.value as CalculationMethod
                      setItem((current) => ({ ...current, calculation_method: method, quantity: method === 'lsum' ? '1' : current.quantity, unit: method === 'lsum' ? 'L/SUM' : current.unit }))
                    }} className="field-control">
                      {(['area', 'length', 'qty', 'lsum'] as const).map((method) => <option key={method} value={method}>{calculationMethodLabel(method)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="field-label">Unit</span>
                    <input required value={item.unit} onChange={(event) => update('unit', event.target.value)} className="field-control" placeholder="unit / kps / kaki" />
                  </label>
                  <label className="block">
                    <span className="field-label">Kuantiti / ukuran</span>
                    <input required inputMode="decimal" value={item.quantity} disabled={item.calculation_method === 'lsum'} onChange={(event) => update('quantity', event.target.value)} className="field-control disabled:bg-slate-100" />
                  </label>
                  <label className="block">
                    <span className="field-label">Kadar (RM)</span>
                    <input required inputMode="decimal" value={item.rate} onChange={(event) => update('rate', event.target.value)} className="field-control" />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950 p-4 text-white">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-300"><Calculator className="h-5 w-5 text-amber-300" />Jumlah item</div>
                  <p className="text-xl font-black">{formatMoney(quotationItemAmount(item))}</p>
                </div>
                {parseNonNegativeNumber(item.rate) === 0 && <p className="text-xs font-bold text-amber-700">Kadar RM0.00 bermaksud harga masih perlu disahkan atau dimasukkan secara manual.</p>}
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-slate-300 text-sm font-black text-slate-700">Batal</button>
            <button type="submit" disabled={mode === 'catalog'} className="min-h-12 rounded-xl bg-amber-400 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Simpan Item</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
