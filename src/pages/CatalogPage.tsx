import {
  Archive,
  BookOpenText,
  CheckCircle2,
  CircleDollarSign,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  filterCatalogItems,
  formatRinggitRate,
  parseCatalogRate,
  type CatalogCategory,
  type CatalogItem,
} from '../lib/catalog'
import { supabase } from '../lib/supabase'

type CatalogForm = {
  category_id: string
  name: string
  description: string
  unit: string
  rate: string
  price_note: string
}

const emptyForm: CatalogForm = {
  category_id: '',
  name: '',
  description: '',
  unit: 'unit',
  rate: '0.00',
  price_note: '',
}

const suggestedUnits = ['unit', 'kaki', 'kps', 'point', 'lot', 'set', 'trip', 'hari', 'meter', 'kg', 'tan']

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export function CatalogPage() {
  const { user } = useAuth()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<CatalogForm>(emptyForm)

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadCatalog() {
      setLoading(true)
      setError('')

      const { data: company, error: companyError } = await client
        .from('companies')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()

      if (!mounted) return
      if (companyError) {
        setError(companyError.message)
        setLoading(false)
        return
      }
      if (!company) {
        setLoading(false)
        return
      }

      setCompanyId(company.id)

      const [categoryResult, itemResult] = await Promise.all([
        client
          .from('company_catalog_categories')
          .select('*')
          .eq('company_id', company.id)
          .order('sort_order')
          .order('id'),
        client
          .from('company_catalog_items')
          .select('*')
          .eq('company_id', company.id)
          .order('sort_order')
          .order('id'),
      ])

      if (!mounted) return
      if (categoryResult.error || itemResult.error) {
        setError(categoryResult.error?.message ?? itemResult.error?.message ?? 'Katalog tidak dapat dimuatkan.')
      } else {
        setCategories(categoryResult.data)
        setItems(itemResult.data)
      }
      setLoading(false)
    }

    void loadCatalog()
    return () => {
      mounted = false
    }
  }, [user])

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  )
  const activeItemCount = useMemo(() => items.filter((item) => item.is_active).length, [items])
  const archivedItemCount = items.length - activeItemCount
  const visibleItems = useMemo(
    () => filterCatalogItems(items, { search, categoryId: selectedCategory, showArchived }),
    [items, search, selectedCategory, showArchived],
  )
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  function openAddForm() {
    setEditingItem(null)
    setForm({ ...emptyForm, category_id: String(activeCategories[0]?.id ?? '') })
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  function openEditForm(item: CatalogItem) {
    setEditingItem(item)
    setForm({
      category_id: String(item.category_id),
      name: item.name,
      description: item.description,
      unit: item.unit,
      rate: item.rate.toFixed(2),
      price_note: item.price_note ?? '',
    })
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditingItem(null)
  }

  function updateForm<K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || !companyId) return

    const categoryId = Number(form.category_id)
    const rate = parseCatalogRate(form.rate)
    if (!Number.isInteger(categoryId) || !activeCategories.some((category) => category.id === categoryId)) {
      setError('Pilih kategori item yang sah.')
      return
    }
    if (!form.name.trim() || !form.description.trim() || !form.unit.trim()) {
      setError('Nama, keterangan dan unit mesti diisi.')
      return
    }
    if (rate === null) {
      setError('Harga mesti nombor sifar atau lebih besar.')
      return
    }

    const values = {
      category_id: categoryId,
      name: form.name.trim(),
      description: form.description.trim(),
      unit: form.unit.trim(),
      rate,
      price_note: nullable(form.price_note),
    }

    try {
      setSaving(true)
      setError('')
      if (editingItem) {
        const { data, error: updateError } = await supabase
          .from('company_catalog_items')
          .update(values)
          .eq('id', editingItem.id)
          .eq('company_id', companyId)
          .select('*')
          .single()
        if (updateError) throw updateError
        setItems((current) => current.map((item) => (item.id === data.id ? data : item)))
        setNotice('Item berjaya dikemas kini tanpa mengubah katalog pengguna lain.')
      } else {
        const nextSortOrder = items
          .filter((item) => item.category_id === categoryId)
          .reduce((highest, item) => Math.max(highest, item.sort_order), 0) + 10
        const { data, error: insertError } = await supabase
          .from('company_catalog_items')
          .insert({
            ...values,
            company_id: companyId,
            owner_user_id: user.id,
            sort_order: nextSortOrder,
          })
          .select('*')
          .single()
        if (insertError) throw insertError
        setItems((current) => [...current, data])
        setNotice('Item baharu berjaya ditambah ke katalog syarikat.')
      }
      setFormOpen(false)
      setEditingItem(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Item tidak dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function setItemArchived(item: CatalogItem, archived: boolean) {
    if (!supabase || !companyId) return
    if (archived && !window.confirm(`Arkibkan “${item.name}”? Item boleh dipulihkan semula.`)) return

    try {
      setSaving(true)
      setError('')
      const { data, error: updateError } = await supabase
        .from('company_catalog_items')
        .update({ is_active: !archived })
        .eq('id', item.id)
        .eq('company_id', companyId)
        .select('*')
        .single()
      if (updateError) throw updateError
      setItems((current) => current.map((currentItem) => (currentItem.id === data.id ? data : currentItem)))
      setFormOpen(false)
      setEditingItem(null)
      setNotice(archived ? 'Item telah diarkibkan.' : 'Item telah dipulihkan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Status item tidak dapat dikemas kini.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan katalog syarikat...</div>
  }

  if (!companyId && !error) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <BookOpenText className="h-8 w-8 text-amber-700" />
        <h1 className="mt-4 text-2xl font-black">Lengkapkan profil dahulu</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Katalog peribadi akan diwujudkan selepas profil syarikat pertama disimpan.</p>
        <Link href="/profil" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white">Pergi ke Profil Syarikat</Link>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-bold text-amber-700">Tetapan harga syarikat</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Katalog & Harga</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Item ini milik syarikat kau. Edit harga, keterangan atau unit tanpa menjejaskan katalog syarikat lain.
        </p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Ringkasan katalog">
        <SummaryCard icon={<BookOpenText />} value={activeItemCount} label="Item aktif" />
        <SummaryCard icon={<Layers3 />} value={activeCategories.length} label="Kategori" />
        <div className="col-span-2 sm:col-span-1">
          <SummaryCard icon={<CircleDollarSign />} value="RM" label="Harga boleh diedit" />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari contoh: tabletop, mozek, plug point"
            className="field-control pl-11 pr-11"
            aria-label="Cari item katalog"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Kosongkan carian">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
          <div className="flex w-max gap-2">
            <FilterChip active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>Semua</FilterChip>
            {activeCategories.map((category) => (
              <FilterChip key={category.id} active={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.name}</FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500">{visibleItems.length} item dipaparkan</p>
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${showArchived ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {showArchived ? 'Lihat aktif' : `Arkib (${archivedItemCount})`}
          </button>
        </div>
      </section>

      {visibleItems.length ? (
        <section className="grid gap-3 md:grid-cols-2" aria-label="Senarai item katalog">
          {visibleItems.map((item) => (
            <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${item.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">{categoryNames.get(item.category_id) ?? 'Kategori'}</span>
                    {item.source_item_id && <span className="text-[11px] font-semibold text-slate-400">Item lalai</span>}
                  </div>
                  <h2 className="mt-3 text-base font-black leading-6 text-slate-950">{item.name}</h2>
                </div>
                <button type="button" onClick={() => openEditForm(item)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50" aria-label={`Edit ${item.name}`}>
                  <Pencil className="h-4.5 w-4.5" />
                </button>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              {item.price_note && <p className="mt-2 text-xs leading-5 text-slate-400">{item.price_note}</p>}
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xl font-black tracking-tight text-slate-950">{formatRinggitRate(item.rate)}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">setiap {item.unit}</p>
                </div>
                {!item.is_active && (
                  <button type="button" disabled={saving} onClick={() => void setItemArchived(item, false)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:opacity-60">
                    <RotateCcw className="h-4 w-4" /> Pulihkan
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <Search className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-4 font-black">Tiada item ditemui</h2>
          <p className="mt-2 text-sm text-slate-500">Ubah carian, pilih kategori lain atau tambah item baharu.</p>
        </section>
      )}

      <button
        type="button"
        onClick={openAddForm}
        disabled={!activeCategories.length}
        className="fixed bottom-24 right-4 z-20 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-amber-400 px-5 text-sm font-black text-slate-950 shadow-xl shadow-amber-300/50 transition hover:bg-amber-300 disabled:opacity-60 lg:bottom-8 lg:right-8"
      >
        <Plus className="h-5 w-5" /> Tambah Item
      </button>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="catalog-form-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <form onSubmit={handleSubmit}>
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-bold text-amber-700">Katalog syarikat</p>
                  <h2 id="catalog-form-title" className="mt-1 text-xl font-black">{editingItem ? 'Edit item' : 'Tambah item baharu'}</h2>
                </div>
                <button type="button" onClick={closeForm} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Tutup borang">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="space-y-4 px-5 py-5 sm:px-6">
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
                <label className="block">
                  <span className="field-label">Kategori <span className="text-red-600">*</span></span>
                  <select required value={form.category_id} onChange={(event) => updateForm('category_id', event.target.value)} className="field-control">
                    <option value="" disabled>Pilih kategori</option>
                    {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Nama item <span className="text-red-600">*</span></span>
                  <input required value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="field-control" placeholder="Contoh: Tabletop konkrit kemasan mozek" />
                </label>
                <label className="block">
                  <span className="field-label">Keterangan default <span className="text-red-600">*</span></span>
                  <textarea required value={form.description} onChange={(event) => updateForm('description', event.target.value)} className="field-control resize-y" placeholder="Ayat yang akan masuk ke sebutharga dan masih boleh diubah kemudian." />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Unit <span className="text-red-600">*</span></span>
                    <input required list="catalog-unit-options" value={form.unit} onChange={(event) => updateForm('unit', event.target.value)} className="field-control" placeholder="Contoh: kps" />
                    <datalist id="catalog-unit-options">{suggestedUnits.map((unit) => <option key={unit} value={unit} />)}</datalist>
                  </label>
                  <label className="block">
                    <span className="field-label">Harga jual (RM) <span className="text-red-600">*</span></span>
                    <input required inputMode="decimal" value={form.rate} onChange={(event) => updateForm('rate', event.target.value)} className="field-control" placeholder="0.00" />
                  </label>
                </div>
                <label className="block">
                  <span className="field-label">Nota harga</span>
                  <textarea value={form.price_note} onChange={(event) => updateForm('price_note', event.target.value)} className="field-control min-h-24 resize-y" placeholder="Contoh: Tidak termasuk hacking dan pembuangan sisa." />
                </label>

                {editingItem?.is_active && (
                  <button type="button" disabled={saving} onClick={() => void setItemArchived(editingItem, true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
                    <Archive className="h-4.5 w-4.5" /> Arkibkan item ini
                  </button>
                )}
              </div>

              <footer className="safe-bottom sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:justify-end sm:px-6">
                <button type="button" onClick={closeForm} disabled={saving} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 disabled:opacity-60 sm:flex-none">Batal</button>
                <button type="submit" disabled={saving} className="min-h-12 flex-[1.5] rounded-xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-60 sm:flex-none">
                  {saving ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Tambah Item'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <article className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-800 [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</div>
      <p className="mt-3 text-xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
    </article>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-10 rounded-full border px-4 text-xs font-bold transition ${active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'}`}>
      {children}
    </button>
  )
}
