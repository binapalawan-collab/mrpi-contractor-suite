import {
  ArrowLeft,
  Banknote,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Store,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'
import { ErrorBlock, LoadingBlock } from '../components/State'
import { categoryLabel, formatDate, formatMoney, paymentMethods, statusLabel, statusTone } from '../lib/expenses'
import { errorMessage } from '../lib/errors'
import { normalizeExpense } from '../lib/queries'
import { supabase } from '../lib/supabase'
import type {
  Expense,
  ExpenseAttachment,
  ExpenseItem,
  ExpensePayment,
  PaymentMethod,
  Project,
  Supplier,
} from '../types/domain'

type ReceiptLink = ExpenseAttachment & { url: string }

export function ExpenseDetailPage({ expenseId }: { expenseId: string }) {
  const id = Number(expenseId)
  const [, navigate] = useLocation()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [payments, setPayments] = useState<ExpensePayment[]>([])
  const [attachments, setAttachments] = useState<ReceiptLink[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<ExpensePayment | null>(null)
  const [paymentToDelete, setPaymentToDelete] = useState<ExpensePayment | null>(null)
  const [deleteExpenseOpen, setDeleteExpenseOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    if (!supabase) return
    const client = supabase
    setLoading(true)
    setError('')
    try {
      const { data: expenseData, error: expenseError } = await client.from('project_expenses').select('*').eq('id', id).single()
      if (expenseError) throw expenseError
      const row = normalizeExpense(expenseData as Record<string, unknown>)
      setExpense(row)

      const [projectResult, itemResult, paymentResult, attachmentResult, supplierResult] = await Promise.all([
        client.from('projects').select('id,company_id,owner_user_id,project_no,project_name,client_name,status,current_contract_amount').eq('id', row.project_id).single(),
        client.from('project_expense_items').select('*').eq('expense_id', id).order('sort_order'),
        client.from('project_expense_payments').select('*').eq('expense_id', id).order('payment_date', { ascending: false }).order('id', { ascending: false }),
        client.from('project_expense_attachments').select('*').eq('expense_id', id).order('id'),
        row.supplier_id
          ? client.from('expense_suppliers').select('*').eq('id', row.supplier_id).single()
          : Promise.resolve({ data: null, error: null }),
      ])

      for (const result of [projectResult, itemResult, paymentResult, attachmentResult, supplierResult]) {
        if (result.error) throw result.error
      }
      if (!projectResult.data) throw new Error('Projek bagi expenses ini tidak ditemui.')

      setProject({
        ...projectResult.data,
        current_contract_amount: Number(projectResult.data.current_contract_amount),
      } as Project)
      setItems((itemResult.data ?? []).map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        amount: Number(item.amount),
      })) as ExpenseItem[])
      setPayments((paymentResult.data ?? []).map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })) as ExpensePayment[])
      setSupplier(supplierResult.data as Supplier | null)

      const links: ReceiptLink[] = []
      for (const file of (attachmentResult.data ?? []) as ExpenseAttachment[]) {
        const { data } = await client.storage.from('expense-receipts').createSignedUrl(file.storage_path, 3600)
        links.push({ ...file, url: data?.signedUrl ?? '' })
      }
      setAttachments(links)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [id])

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !expense) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { error: paymentError } = await supabase.rpc('record_project_expense_payment', {
        p_expense_id: expense.id,
        p_payment_date: String(form.get('payment_date')),
        p_amount: Number(form.get('amount')),
        p_payment_method: String(form.get('payment_method')),
        p_reference_no: String(form.get('reference_no') || '') || null,
        p_notes: String(form.get('notes') || ''),
      })
      if (paymentError) throw paymentError
      setPayOpen(false)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function correctPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !editingPayment) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { error: correctionError } = await supabase.rpc('correct_manual_project_expense_payment', {
        p_payment_id: editingPayment.id,
        p_payment_date: String(form.get('payment_date')),
        p_amount: Number(form.get('amount')),
        p_payment_method: String(form.get('payment_method')),
        p_reference_no: String(form.get('reference_no') || '') || null,
        p_notes: String(form.get('notes') || ''),
      })
      if (correctionError) throw correctionError
      setEditingPayment(null)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment() {
    if (!supabase || !paymentToDelete) return
    setSaving(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.rpc('delete_manual_project_expense_payment', {
        p_payment_id: paymentToDelete.id,
      })
      if (deleteError) throw deleteError
      setPaymentToDelete(null)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function deleteExpense() {
    if (!supabase || !expense) return
    setSaving(true)
    setError('')
    try {
      const { data, error: deleteError } = await supabase.rpc('delete_manual_project_expense', {
        p_expense_id: expense.id,
      })
      if (deleteError) throw deleteError
      const storagePaths = Array.isArray(data)
        ? data.filter((path): path is string => typeof path === 'string' && path.length > 0)
        : []
      if (storagePaths.length) await supabase.storage.from('expense-receipts').remove(storagePaths)
      navigate('/expenses', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
      setDeleteExpenseOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items])

  if (loading) return <LoadingBlock label="Memuatkan butiran expenses..." />
  if (error && !expense) return <ErrorBlock message={error} retry={() => void refresh()} />
  if (!expense) return null

  const manual = expense.source_type === 'manual'

  return <>
    <PageHeader
      eyebrow={project?.project_no}
      title={expense.description}
      description={`${project?.project_name ?? ''} · ${formatDate(expense.expense_date)}`}
      action={<div className="flex flex-wrap gap-2">
        {manual && <Link href={`/expenses/${expense.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" />Edit</Link>}
        {manual && <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700" onClick={() => setDeleteExpenseOpen(true)}><Trash2 className="h-4 w-4" />Padam</button>}
        <Link href="/expenses" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      </div>}
    />

    {error && <div className="mb-5"><ErrorBlock message={error} /></div>}
    {!manual && <p className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-violet-800">
      Rekod ini dijana oleh MRPI Workforce. Untuk membetulkannya, batalkan bayaran berkaitan dalam Sejarah Workforce dahulu.
    </p>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Summary icon={WalletCards} label="Jumlah" value={formatMoney(expense.total_amount)} />
      <Summary icon={Banknote} label="Sudah dibayar" value={formatMoney(expense.paid_amount)} accent />
      <Summary icon={Receipt} label="Baki" value={formatMoney(expense.balance_amount)} danger={expense.balance_amount > 0} />
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-6">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone(expense.status)}`}>{statusLabel(expense.status)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">{categoryLabel(expense.category)}</span>
              {!manual && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">Daripada Workforce</span>}
            </div>
            <h2 className="mt-4 text-lg font-black">Pecahan item</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 p-5">
              <div><p className="font-bold">{item.description}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit} × {formatMoney(item.unit_price)}</p></div>
              <p className="font-black">{formatMoney(item.amount)}</p>
            </div>)}
          </div>
          <div className="flex justify-between bg-slate-950 p-5 text-white"><span className="font-bold text-slate-300">Jumlah item</span><strong className="text-lg text-emerald-300">{formatMoney(totalItems)}</strong></div>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-black">Maklumat tambahan</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Info label="Pembekal" value={supplier?.name ?? 'Tidak dinyatakan'} icon={Store} />
            <Info label="Sumber rekod" value={manual ? 'Expenses manual' : 'MRPI Workforce'} icon={FileText} />
            <div className="sm:col-span-2"><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Catatan</dt><dd className="mt-1 whitespace-pre-line font-semibold text-slate-700">{expense.notes || 'Tiada catatan.'}</dd></div>
          </dl>
        </section>
      </div>

      <div className="space-y-6">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-black">Bayaran</h2><p className="mt-1 text-xs text-slate-500">Rekod bayaran kepada pembekal.</p></div>
            {manual && expense.balance_amount > 0 && <button className="btn-primary" onClick={() => setPayOpen((value) => !value)}><Plus className="h-4 w-4" />Bayaran</button>}
          </div>

          {payOpen && <form onSubmit={addPayment} className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            <label><span className="field-label">Tarikh</span><input name="payment_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="field-control" /></label>
            <label><span className="field-label">Amaun</span><input name="amount" type="number" min="0.01" max={expense.balance_amount} step="0.01" required defaultValue={expense.balance_amount} className="field-control" /></label>
            <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue={'bank_transfer' satisfies PaymentMethod}>{paymentMethods.map((method) => <option value={method.value} key={method.value}>{method.label}</option>)}</select></label>
            <label><span className="field-label">No. rujukan</span><input name="reference_no" className="field-control" /></label>
            <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" /></label>
            <button disabled={saving} className="btn-primary w-full">{saving ? 'Menyimpan...' : 'Simpan bayaran'}</button>
          </form>}

          <div className="mt-4 space-y-3">
            {payments.map((payment) => <div key={payment.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex justify-between gap-3">
                <div><p className="text-sm font-black">{formatDate(payment.payment_date)}</p><p className="mt-1 text-xs text-slate-500">{paymentMethods.find((method) => method.value === payment.payment_method)?.label}{payment.reference_no ? ` · ${payment.reference_no}` : ''}</p>{payment.notes && <p className="mt-1 text-xs text-slate-400">{payment.notes}</p>}</div>
                <p className="font-black text-emerald-700">{formatMoney(payment.amount)}</p>
              </div>
              {manual && <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-black text-slate-600 hover:bg-slate-50" onClick={() => setEditingPayment(payment)}><Pencil className="h-3.5 w-3.5" />Edit</button>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-black text-rose-700 hover:bg-rose-50" onClick={() => setPaymentToDelete(payment)}><Trash2 className="h-3.5 w-3.5" />Padam</button>
              </div>}
            </div>)}
            {!payments.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada bayaran.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-black">Resit & dokumen</h2>
          <div className="mt-4 space-y-2">
            {attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold hover:border-emerald-300"><FileText className="h-5 w-5 text-emerald-600" /><span className="min-w-0 truncate">{file.file_name}</span></a>)}
            {!attachments.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Tiada resit dilampirkan.</p>}
          </div>
        </section>
      </div>
    </div>

    {editingPayment && <PaymentEditSheet
      payment={editingPayment}
      maxAmount={expense.balance_amount + editingPayment.amount}
      saving={saving}
      onClose={() => setEditingPayment(null)}
      onSubmit={correctPayment}
    />}
    {paymentToDelete && <ConfirmDialog
      title="Padam bayaran ini?"
      description={`${formatMoney(paymentToDelete.amount)} akan dikeluarkan dan baki expenses dikira semula.`}
      confirmLabel="Padam bayaran"
      busy={saving}
      onCancel={() => setPaymentToDelete(null)}
      onConfirm={() => void deletePayment()}
    />}
    {deleteExpenseOpen && <ConfirmDialog
      title="Padam seluruh rekod expenses?"
      description="Semua item, bayaran dan lampiran dalam rekod ini akan dipadam. Tindakan ini tidak boleh dibatalkan."
      confirmLabel="Padam expenses"
      busy={saving}
      onCancel={() => setDeleteExpenseOpen(false)}
      onConfirm={() => void deleteExpense()}
    />}
  </>
}

function PaymentEditSheet({
  payment,
  maxAmount,
  saving,
  onClose,
  onSubmit,
}: {
  payment: ExpensePayment
  maxAmount: number
  saving: boolean
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={() => !saving && onClose()}>
    <section className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="payment-edit-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between"><h2 id="payment-edit-title" className="text-xl font-black">Edit bayaran</h2><button type="button" className="h-10 rounded-xl px-3 text-sm font-black text-slate-500 hover:bg-slate-100" disabled={saving} onClick={onClose}>Tutup</button></div>
      <form onSubmit={onSubmit} className="space-y-4">
        <label><span className="field-label">Tarikh</span><input name="payment_date" type="date" required defaultValue={payment.payment_date} className="field-control" /></label>
        <label><span className="field-label">Amaun</span><input name="amount" type="number" min="0.01" max={maxAmount} step="0.01" required defaultValue={payment.amount} className="field-control" /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue={payment.payment_method}>{paymentMethods.map((method) => <option value={method.value} key={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">No. rujukan</span><input name="reference_no" className="field-control" defaultValue={payment.reference_no ?? ''} /></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" defaultValue={payment.notes} /></label>
        <button disabled={saving} className="btn-primary w-full"><Pencil className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan pembetulan'}</button>
      </form>
    </section>
  </div>
}

function Summary({ icon: Icon, label, value, accent, danger }: { icon: typeof WalletCards; label: string; value: string; accent?: boolean; danger?: boolean }) {
  return <article className="card p-5"><Icon className={`h-5 w-5 ${danger ? 'text-rose-500' : accent ? 'text-emerald-600' : 'text-slate-400'}`} /><p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-xl font-black ${danger ? 'text-rose-700' : accent ? 'text-emerald-700' : ''}`}>{value}</p></article>
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Store }) {
  return <div><dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><Icon className="h-4 w-4" />{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>
}
