import { BookOpenText, Calculator, Check, ClipboardList, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { CatalogCategory, CatalogItem } from '../../lib/catalog'
import type { ProjectItem } from '../../lib/project'
import {
  calculationMethodLabel,
  formatMoney,
  parseNonNegativeNumber,
  parsePositiveNumber,
  type CalculationMethod,
} from '../../lib/quotation'
import {
  blankVariationOrderItem,
  formatSignedMoney,
  variationChangeTypeLabel,
  variationItemFromCatalog,
  variationItemFromProject,
  variationOrderItemAmount,
  type VariationChangeType,
  type VariationDirection,
  type VariationOrderDraftItem,
} from '../../lib/variationOrder'
import type {
  StoredVariationOrderItemEditorDraft,
  VariationOrderItemEditorDraft,
} from '../../lib/variationOrderDrafts'

type Props = {
  categories: CatalogCategory[]
  catalogItems: CatalogItem[]
  projectItems: ProjectItem[]
  initialItem: VariationOrderDraftItem | null
  initialDraft: StoredVariationOrderItemEditorDraft | null
  onClose: () => void
  onDraftChange: (draft: Pick<VariationOrderItemEditorDraft, 'item' | 'mode' | 'search' | 'category_id'>) => void
  onSave: (item: VariationOrderDraftItem) => void
}

export function VariationOrderItemDialog({
  categories,
  catalogItems,
  projectItems,
  initialItem,
  initialDraft,
  onClose,
  onDraftChange,
  onSave,
}: Props) {
  const [item, setItem] = useState<VariationOrderDraftItem>(() => initialDraft?.item ?? initialItem ?? blankVariationOrderItem())
  const [mode, setMode] = useState<'baseline' | 'catalog' | 'manual'>(() => initialDraft?.mode ?? (initialItem ? 'manual' : 'catalog'))
  const [search, setSearch] = useState(() => initialDraft?.search ?? '')
  const [categoryId, setCategoryId] = useState<number | 'all'>(() => initialDraft?.category_id ?? 'all')
  const [error, setError] = useState('')
  const latestDraft = useRef<Pick<VariationOrderItemEditorDraft, 'item' | 'mode' | 'search' | 'category_id'>>({
    item,
    mode,
    search,
    category_id: categoryId,
  })

  latestDraft.current = { item, mode, search, category_id: categoryId }

  useEffect(() => {
    onDraftChange(latestDraft.current)
  }, [categoryId, item, mode, onDraftChange, search])

  useEffect(() => {
    const persistBeforeLeaving = () => onDraftChange(latestDraft.current)
    window.addEventListener('pagehide', persistBeforeLeaving)
    document.addEventListener('visibilitychange', persistBeforeLeaving)
    return () => {
      window.removeEventListener('pagehide', persistBeforeLeaving)
      document.removeEventListener('visibilitychange', persistBeforeLeaving)
    }
  }, [onDraftChange])

  const categoryNameMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const query = search.trim().toLocaleLowerCase('ms-MY')
  const visibleCatalog = useMemo(() => catalogItems
    .filter((catalogItem) => catalogItem.is_active)
    .filter((catalogItem) => categoryId === 'all' || catalogItem.category_id === categoryId)
    .filter((catalogItem) => !query || [catalogItem.name, catalogItem.description, catalogItem.code, catalogItem.unit]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ms-MY').includes(query)))
    .slice(0, 40), [catalogItems, categoryId, query])
  const visibleBaseline = useMemo(() => projectItems
    .filter((projectItem) => !query || [projectItem.item_name, projectItem.description, projectItem.measurement_text, projectItem.unit]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ms-MY').includes(query)))
    .slice(0, 40), [projectItems, query])

  function update<K extends keyof VariationOrderDraftItem>(key: K, value: VariationOrderDraftItem[K]) {
    setItem((current) => ({ ...current, [key]: value }))
  }

  function chooseChangeType(changeType: VariationChangeType) {
    setItem((current) => ({
      ...current,
      change_type: changeType,
      direction: changeType === 'omission' || changeType === 'discount'
        ? 'deduct'
        : changeType === 'addition'
          ? 'add'
          : current.direction,
    }))
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
      <section role="dialog" aria-modal="true" aria-labelledby="vo-item-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div><p className="text-xs font-bold text-amber-700">Item Variation Order</p><h2 id="vo-item-title" className="mt-1 text-xl font-black">{initialItem ? 'Edit perubahan' : 'Tambah perubahan'}</h2></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </header>

        <form onSubmit={submit}>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {initialDraft && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Draf item terakhir dipulihkan. Kau boleh sambung maklumat yang telah diisi.</p>}
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

            <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 p-1.5">
              <button type="button" onClick={() => setMode('baseline')} className={`min-h-11 rounded-xl px-2 text-xs font-black ${mode === 'baseline' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Skop Asal</button>
              <button type="button" onClick={() => setMode('catalog')} className={`min-h-11 rounded-xl px-2 text-xs font-black ${mode === 'catalog' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Katalog</button>
              <button type="button" onClick={() => { setMode('manual'); if (!initialItem) setItem((current) => ({ ...current, catalog_item_id: null, source_project_item_id: null })) }} className={`min-h-11 rounded-xl px-2 text-xs font-black ${mode === 'manual' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Manual</button>
            </div>

            {mode !== 'manual' ? (
              <div className="space-y-3">
                <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder={mode === 'baseline' ? 'Cari skop kontrak asal...' : 'Cari item katalog...'} autoFocus /></div>
                {mode === 'catalog' && <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6"><div className="flex w-max gap-2"><button type="button" onClick={() => setCategoryId('all')} className={`min-h-10 rounded-full px-4 text-xs font-black ${categoryId === 'all' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Semua</button>{categories.filter((category) => category.is_active).map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`min-h-10 rounded-full px-4 text-xs font-black ${categoryId === category.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{category.name}</button>)}</div></div>}
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {mode === 'baseline' ? visibleBaseline.map((projectItem) => <button key={projectItem.id} type="button" onClick={() => { setItem(variationItemFromProject(projectItem)); setMode('manual') }} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-left hover:border-blue-300 hover:bg-blue-50"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><ClipboardList className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-black leading-5">{projectItem.item_name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{projectItem.description}</p><p className="mt-2 text-xs font-black text-slate-700">{formatMoney(Number(projectItem.amount))}</p></div></button>) : visibleCatalog.map((catalogItem) => <button key={catalogItem.id} type="button" onClick={() => { setItem(variationItemFromCatalog(catalogItem)); setMode('manual') }} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-left hover:border-amber-300 hover:bg-amber-50"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><BookOpenText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{categoryNameMap.get(catalogItem.category_id) ?? 'Katalog'}</p><p className="mt-1 font-black leading-5">{catalogItem.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{catalogItem.description}</p><p className="mt-2 text-xs font-black text-slate-700">{formatMoney(catalogItem.rate)} / {catalogItem.unit}</p></div><Check className={`mt-2 h-5 w-5 shrink-0 ${item.catalog_item_id === catalogItem.id ? 'text-emerald-600' : 'text-slate-200'}`} /></button>)}
                  {(mode === 'baseline' ? !visibleBaseline.length : !visibleCatalog.length) && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Tiada item ditemui. Ubah carian atau pilih Manual.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="field-label">Jenis perubahan</span><select value={item.change_type} onChange={(event) => chooseChangeType(event.target.value as VariationChangeType)} className="field-control">{(['addition', 'omission', 'replacement', 'specification', 'discount'] as const).map((changeType) => <option key={changeType} value={changeType}>{variationChangeTypeLabel(changeType)}</option>)}</select></label>
                  <label className="block"><span className="field-label">Kesan pada nilai</span><select value={item.direction} onChange={(event) => update('direction', event.target.value as VariationDirection)} className="field-control"><option value="add">Tambah (+)</option><option value="deduct">Tolak (−)</option></select></label>
                </div>
                {item.change_type === 'replacement' && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800">Untuk kiraan penggantian yang tepat, masukkan item lama sebagai Tolak dan item baharu sebagai Tambah.</p>}
                {item.source_project_item_id && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Item ini dirujuk daripada skop kontrak asal. Butirannya boleh diselaraskan untuk nilai perubahan sebenar.</p>}
                {item.catalog_item_id && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Item katalog dipilih. Butiran masih boleh diubah untuk VO ini sahaja.</p>}
                <label className="block"><span className="field-label">Nama item *</span><input required value={item.item_name} onChange={(event) => update('item_name', event.target.value)} className="field-control" placeholder="Contoh: Tambahan mozek porch" /></label>
                <label className="block"><span className="field-label">Keterangan *</span><textarea required value={item.description} onChange={(event) => update('description', event.target.value)} className="field-control" placeholder="Ayat penuh untuk dokumen VO." /></label>
                <label className="block"><span className="field-label">Ukuran / rujukan</span><textarea value={item.measurement_text} onChange={(event) => update('measurement_text', event.target.value)} className="field-control min-h-20" placeholder="Pilihan. Contoh: 12 kaki × 8 kaki" /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="field-label">Cara kira</span><select value={item.calculation_method} onChange={(event) => { const method = event.target.value as CalculationMethod; setItem((current) => ({ ...current, calculation_method: method, quantity: method === 'lsum' ? '1' : current.quantity, unit: method === 'lsum' ? 'L/SUM' : current.unit })) }} className="field-control">{(['area', 'length', 'qty', 'lsum'] as const).map((method) => <option key={method} value={method}>{calculationMethodLabel(method)}</option>)}</select></label>
                  <label className="block"><span className="field-label">Unit</span><input required value={item.unit} onChange={(event) => update('unit', event.target.value)} className="field-control" /></label>
                  <label className="block"><span className="field-label">Kuantiti / ukuran</span><input required inputMode="decimal" value={item.quantity} disabled={item.calculation_method === 'lsum'} onChange={(event) => update('quantity', event.target.value)} className="field-control disabled:bg-slate-100" /></label>
                  <label className="block"><span className="field-label">Kadar (RM)</span><input required inputMode="decimal" value={item.rate} onChange={(event) => update('rate', event.target.value)} className="field-control" /></label>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center gap-2 text-sm font-bold text-slate-300"><Calculator className="h-5 w-5 text-amber-300" />Kesan nilai</div><p className={`text-xl font-black ${item.direction === 'deduct' ? 'text-red-300' : 'text-emerald-300'}`}>{formatSignedMoney(variationOrderItemAmount(item))}</p></div>
                {parseNonNegativeNumber(item.rate) === 0 && <p className="text-xs font-bold text-amber-700">Kadar RM0.00 tidak mengubah nilai kontrak.</p>}
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6"><button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-slate-300 text-sm font-black text-slate-700">Batal</button><button type="submit" disabled={mode !== 'manual'} className="min-h-12 rounded-xl bg-amber-400 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Simpan Perubahan</button></footer>
        </form>
      </section>
    </div>
  )
}
