import { ArrowLeft, ArrowRightLeft, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { ErrorBlock, LoadingBlock } from '../components/State'
import {
  expenseCategories,
  expenseItemsTotal,
  formatMoney,
  validateExpenseCorrection,
} from '../lib/expenses'
import { errorMessage } from '../lib/errors'
import { loadProjects, loadSuppliers, normalizeExpense } from '../lib/queries'
import { supabase } from '../lib/supabase'
import type {
  DraftExpenseItem,
  Expense,
  ExpenseCategory,
  ExpenseItem,
  Project,
  Supplier,
} from '../types/domain'

const blankItem = (): DraftExpenseItem => ({ description: '', quantity: '1', unit: 'unit', unit_price: '' })
const projectLabel = (project: Project) => project.project_alias?.trim() || `${project.project_no} · ${project.project_name}`

export function ExpenseEditPage({ expenseId }: { expenseId: string }) {
  const id = Number(expenseId)
  const [, navigate] = useLocation()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('materials')
  const [description, setDescription] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<DraftExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    setLoading(true)
    Promise.all([
      client.from('project_expenses').select('*').eq('id', id).single(),
      client.from('project_expense_items').select('*').eq('expense_id', id).order('sort_order'),
      loadProjects(),
      loadSuppliers(),
    ]).then(([expenseResult, itemResult, projects, loadedSuppliers]) => {
      if (expenseResult.error) throw expenseResult.error
      if (itemResult.error) throw itemResult.error
      const loadedExpense = normalizeExpense(expenseResult.data as Record<string, unknown>)
      if (loadedExpense.source_type !== 'manual') {
        throw new Error('Rekod daripada Workforce mesti dibetulkan dalam aplikasi Workforce.')
      }
      setExpense(loadedExpense)
      setProjects(projects.filter((item) => item.company_id === loadedExpense.company_id))
      setProjectId(String(loadedExpense.project_id))
      setSuppliers(loadedSuppliers)
      setDate(loadedExpense.expense_date)
      setCategory(loadedExpense.category)
      setDescription(loadedExpense.description)
      setSupplierId(loadedExpense.supplier_id ? String(loadedExpense.supplier_id) : '')
      setNotes(loadedExpense.notes)
      setItems(((itemResult.data ?? []) as ExpenseItem[]).map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit,
        unit_price: String(item.unit_price),
      })))
    }).catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [id])

  const total = useMemo(() => expenseItemsTotal(items), [items])

  function updateItem(index: number, key: keyof DraftExpenseItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, [key]: value }
      : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !expense) return
    if (!projectId) {
      setError('Pilih projek expenses.')
      return
    }
    const validation = validateExpenseCorrection(items, description, expense.paid_amount)
    if (validation) {
      setError(validation)
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: correctionError } = await supabase.rpc('correct_manual_project_expense', {
        p_expense_id: expense.id,
        p_project_id: Number(projectId),
        p_expense_date: date,
        p_category: category,
        p_description: description.trim(),
        p_supplier_id: supplierId ? Number(supplierId) : null,
        p_notes: notes,
        p_items: items.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit: item.unit.trim() || 'unit',
          unit_price: Number(item.unit_price),
        })),
      })
      if (correctionError) throw correctionError
      navigate(`/expenses/${expense.id}`, { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock label="Memuatkan rekod untuk dibetulkan..." />
  if (error && !expense) return <ErrorBlock message={error} />
  if (!expense) return null

  return <>
    <PageHeader
      eyebrow="Pembetulan rekod"
      title="Edit expenses"
      description="Betulkan projek, tarikh, kategori, keterangan, pembekal, item atau jumlah."
      action={<Link href={`/expenses/${expense.id}`} className="btn-secondary"><ArrowLeft className="h-4 w-4" />Batal</Link>}
    />
    {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

    <form onSubmit={submit} className="space-y-5">
      <section className="card p-5">
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <ArrowRightLeft className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-black text-emerald-950">Projek expenses boleh dibetulkan</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">Jika projek ditukar, semua item, bayaran dan lampiran rekod ini akan dipindahkan bersama.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2"><span className="field-label">Projek expenses</span><select className="field-control" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Pilih projek</option>{projects.map((project) => <option key={project.id} value={project.id}>{projectLabel(project)}</option>)}</select></label>
          <label><span className="field-label">Tarikh expenses</span><input type="date" className="field-control" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span className="field-label">Kategori</span><select className="field-control" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span className="field-label">Pembekal</span><select className="field-control" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Tidak dinyatakan</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="md:col-span-2"><span className="field-label">Keterangan</span><input className="field-control" required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="md:col-span-2"><span className="field-label">Catatan</span><textarea className="field-control" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opsyenal" /></label>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">Pecahan item</h2><p className="mt-1 text-xs text-slate-500">Jumlah dikira semula secara automatik.</p></div>
          <button type="button" className="btn-secondary" onClick={() => setItems((current) => [...current, blankItem()])}><Plus className="h-4 w-4" />Item</button>
        </div>
        <div className="mt-5 space-y-4">
          {items.map((item, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Item {index + 1}</p>
              {items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_110px_110px_150px]">
              <input className="field-control" value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Nama bahan / perkhidmatan" required />
              <input className="field-control" type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} placeholder="Kuantiti" required />
              <input className="field-control" value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} placeholder="Unit" />
              <input className="field-control" type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} placeholder="Harga seunit" required />
            </div>
            <p className="mt-3 text-right text-sm font-black">{formatMoney(Number(item.quantity || 0) * Number(item.unit_price || 0))}</p>
          </div>)}
        </div>
        <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white">
          <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-300">Jumlah baharu</span><strong className="text-2xl font-black text-emerald-300">{formatMoney(total)}</strong></div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-3 text-xs"><span className="text-slate-400">Bayaran sedia ada dikekalkan</span><strong>{formatMoney(expense.paid_amount)}</strong></div>
        </div>
      </section>

      <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur lg:bottom-4">
        <button className="btn-primary min-w-44" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan pembetulan'}</button>
      </div>
    </form>
  </>
}
