import type { Invoice, InvoicePayment } from './invoice'
import type { Project } from './project'

export type AgingBucket = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_plus'

export type AgingSummary = Record<AgingBucket, number>

export type StatementTransaction = {
  key: string
  date: string
  timestamp: string
  kind: 'invoice' | 'payment'
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
  invoice_id: number
  payment_id: number | null
}

export type ProjectFinanceSummary = {
  contractValue: number
  billed: number
  received: number
  outstanding: number
  unbilled: number
}

export function isPostedInvoice(invoice: Pick<Invoice, 'status'>) {
  return invoice.status !== 'draft' && invoice.status !== 'void'
}

export function projectFinanceSummary(
  project: Pick<Project, 'current_contract_amount'>,
  invoices: Invoice[],
  payments: InvoicePayment[],
): ProjectFinanceSummary {
  const posted = invoices.filter(isPostedInvoice)
  const billed = roundMoney(posted.reduce((total, invoice) => total + Number(invoice.total_amount), 0))
  const received = roundMoney(payments.reduce((total, payment) => total + Number(payment.amount), 0))
  const contractValue = roundMoney(Number(project.current_contract_amount))
  return {
    contractValue,
    billed,
    received,
    outstanding: roundMoney(Math.max(0, billed - received)),
    unbilled: roundMoney(Math.max(0, contractValue - billed)),
  }
}

export function invoiceAgingBucket(
  invoice: Pick<Invoice, 'due_date' | 'invoice_date'>,
  asOfDate = todayDate(),
): AgingBucket {
  const dueDate = invoice.due_date ?? invoice.invoice_date
  const daysLate = daysBetween(dueDate, asOfDate)
  if (daysLate <= 0) return 'current'
  if (daysLate <= 30) return 'days_1_30'
  if (daysLate <= 60) return 'days_31_60'
  return 'days_61_plus'
}

export function agingSummary(invoices: Invoice[], asOfDate = todayDate()): AgingSummary {
  const result: AgingSummary = { current: 0, days_1_30: 0, days_31_60: 0, days_61_plus: 0 }
  for (const invoice of invoices) {
    const balance = Number(invoice.balance_amount)
    if (!isPostedInvoice(invoice) || balance <= 0) continue
    const bucket = invoiceAgingBucket(invoice, asOfDate)
    result[bucket] = roundMoney(result[bucket] + balance)
  }
  return result
}

export function buildStatementTransactions(invoices: Invoice[], payments: InvoicePayment[]) {
  const posted = invoices.filter(isPostedInvoice)
  const invoiceMap = new Map(posted.map((invoice) => [invoice.id, invoice]))
  const rows: Omit<StatementTransaction, 'balance'>[] = [
    ...posted.map((invoice) => ({
      key: `invoice-${invoice.id}`,
      date: invoice.invoice_date,
      timestamp: invoice.issued_at ?? `${invoice.invoice_date}T00:00:00`,
      kind: 'invoice' as const,
      reference: invoice.invoice_no,
      description: invoice.title,
      debit: Number(invoice.total_amount),
      credit: 0,
      invoice_id: invoice.id,
      payment_id: null,
    })),
    ...payments.flatMap((payment) => {
      const invoice = invoiceMap.get(payment.invoice_id)
      if (!invoice) return []
      return [{
        key: `payment-${payment.id}`,
        date: payment.payment_date,
        timestamp: payment.created_at,
        kind: 'payment' as const,
        reference: payment.receipt_no,
        description: `Bayaran ${invoice.invoice_no}`,
        debit: 0,
        credit: Number(payment.amount),
        invoice_id: payment.invoice_id,
        payment_id: payment.id,
      }]
    }),
  ]

  rows.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate) return byDate
    if (a.kind !== b.kind) return a.kind === 'invoice' ? -1 : 1
    return a.timestamp.localeCompare(b.timestamp) || a.key.localeCompare(b.key)
  })

  let balance = 0
  return rows.map((row): StatementTransaction => {
    balance = roundMoney(balance + row.debit - row.credit)
    return { ...row, balance }
  })
}

export function todayDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetween(from: string, to: string) {
  const fromMs = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const toMs = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  return Math.floor((toMs - fromMs) / 86_400_000)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
