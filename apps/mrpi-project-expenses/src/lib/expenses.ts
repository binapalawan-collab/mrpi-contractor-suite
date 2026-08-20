import type { DraftExpenseItem, ExpenseCategory, ExpenseStatus, PaymentMethod } from '../types/domain'

export const expenseCategories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'materials', label: 'Bahan binaan' }, { value: 'labour', label: 'Upah pekerja' },
  { value: 'subcontractor', label: 'Subkontraktor' }, { value: 'equipment', label: 'Mesin & peralatan' },
  { value: 'transport', label: 'Pengangkutan' }, { value: 'site', label: 'Kos tapak' },
  { value: 'permit', label: 'Permit & fi' }, { value: 'utilities', label: 'Utiliti' },
  { value: 'other', label: 'Lain-lain' },
]

export const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Tunai' }, { value: 'bank_transfer', label: 'Pindahan bank' },
  { value: 'cheque', label: 'Cek' }, { value: 'card', label: 'Kad' }, { value: 'other', label: 'Lain-lain' },
]

export function categoryLabel(value: ExpenseCategory) {
  return expenseCategories.find((item) => item.value === value)?.label ?? value
}
export function statusLabel(value: ExpenseStatus) {
  return ({ unpaid: 'Belum bayar', partially_paid: 'Bayar sebahagian', paid: 'Selesai' } as const)[value]
}
export function statusTone(value: ExpenseStatus) {
  return value === 'paid' ? 'bg-emerald-50 text-emerald-700' : value === 'partially_paid' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
}
export function formatMoney(value: number | string | null | undefined) {
  return `RM ${Number(value ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function formatDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}
export function expenseItemsTotal(items: DraftExpenseItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0)
}
export function validateExpense(items: DraftExpenseItem[], description: string, initialPayment: number) {
  if (!description.trim()) return 'Keterangan expenses mesti diisi.'
  if (!items.length || items.some((item) => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.unit_price) < 0)) return 'Lengkapkan semua item expenses.'
  const total = expenseItemsTotal(items)
  if (total <= 0) return 'Jumlah expenses mesti melebihi RM0.'
  if (initialPayment < 0 || initialPayment > total) return 'Bayaran awal tidak boleh melebihi jumlah expenses.'
  return null
}
export function validateExpenseCorrection(items: DraftExpenseItem[], description: string, paidAmount: number) {
  const baseError = validateExpense(items, description, 0)
  if (baseError) return baseError
  if (expenseItemsTotal(items) < paidAmount) return 'Jumlah baharu tidak boleh kurang daripada bayaran yang telah direkod.'
  return null
}
export function safeFileName(value: string) {
  const dot = value.lastIndexOf('.')
  const extension = dot >= 0 ? value.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  const base = (dot >= 0 ? value.slice(0, dot) : value).normalize('NFKD').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'resit'
  return `${base}${extension}`
}
