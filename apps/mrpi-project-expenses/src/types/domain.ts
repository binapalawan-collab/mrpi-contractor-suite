export type Company = { id: number; owner_user_id: string; legal_name: string; trading_name: string | null }
export type Project = {
  id: number; company_id: number; owner_user_id: string; project_no: string; project_name: string
  client_name: string; status: string; current_contract_amount: number
}
export type ProjectCostOverview = Project & {
  project_id: number; project_status: string; committed_expenses: number; paid_expenses: number
  outstanding_expenses: number; unpaid_wages: number; customer_received: number; estimated_gross_profit: number; cash_position: number
  contract_amount: number; approved_variation_amount: number; pending_variation_amount: number
  pending_variation_count: number; projected_contract_amount: number; projected_gross_profit: number
}
export type Supplier = {
  id: number; company_id: number; owner_user_id: string; name: string; phone: string | null
  notes: string; is_active: boolean; created_at: string; updated_at: string
}
export type Expense = {
  id: number; project_id: number; company_id: number; owner_user_id: string; supplier_id: number | null
  expense_date: string; category: ExpenseCategory; description: string; total_amount: number; paid_amount: number
  balance_amount: number; status: ExpenseStatus; source_type: 'manual' | 'worker_wage' | 'worker_advance'
  source_worker_wage_payment_id: number | null; source_worker_advance_id: number | null
  notes: string; created_at: string; updated_at: string
}
export type ExpenseFeedItem = {
  record_key: string
  record_type: 'expense' | 'worker_wage_debt'
  expense_id: number | null
  worker_id: number | null
  project_id: number
  company_id: number
  owner_user_id: string
  supplier_id: number | null
  expense_date: string
  category: ExpenseCategory
  description: string
  total_amount: number
  paid_amount: number
  balance_amount: number
  status: ExpenseStatus
  source_type: 'manual' | 'worker_wage' | 'worker_advance' | 'worker_wage_debt'
  advance_offset: number
  notes: string
}
export type ExpenseItem = {
  id: number; expense_id: number; description: string; quantity: number; unit: string
  unit_price: number; amount: number; sort_order: number
}
export type ExpensePayment = {
  id: number; expense_id: number; payment_date: string; amount: number; payment_method: PaymentMethod
  reference_no: string | null; notes: string; created_at: string
}
export type ExpenseAttachment = {
  id: number; expense_id: number; storage_path: string; file_name: string; mime_type: string; file_size: number; created_at: string
}
export type ExpenseCategory = 'materials' | 'labour' | 'subcontractor' | 'equipment' | 'transport' | 'site' | 'permit' | 'utilities' | 'other'
export type ExpenseStatus = 'unpaid' | 'partially_paid' | 'paid'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'other'
export type DraftExpenseItem = { description: string; quantity: string; unit: string; unit_price: string }
