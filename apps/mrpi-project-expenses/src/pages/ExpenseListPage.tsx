import { Banknote, Filter, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { categoryLabel, formatDate, formatMoney, statusLabel, statusTone } from '../lib/expenses'
import { errorMessage } from '../lib/errors'
import { loadExpenseFeed, loadProjects } from '../lib/queries'
import type { ExpenseFeedItem, ExpenseStatus, Project } from '../types/domain'

export function ExpenseListPage() {
  const [expenses, setExpenses] = useState<ExpenseFeedItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState(() => new URLSearchParams(window.location.search).get('project') ?? '')
  const [status, setStatus] = useState<'' | ExpenseStatus>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = () => {
    setLoading(true)
    setError('')
    Promise.all([loadExpenseFeed(), loadProjects()])
      .then(([expenseRows, projectRows]) => {
        setExpenses(expenseRows)
        setProjects(projectRows)
      })
      .catch((caughtError) => setError(errorMessage(caughtError)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const shown = useMemo(() => expenses.filter((expense) => (
    (!projectId || expense.project_id === Number(projectId))
    && (!status || expense.status === status)
    && (!search.trim() || `${expense.description} ${expense.notes} ${projectMap.get(expense.project_id)?.project_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )), [expenses, projectId, status, search, projectMap])

  const debt = useMemo(() => shown.reduce((total, expense) => {
    if (expense.balance_amount <= 0) return total
    total.all += expense.balance_amount
    if (expense.record_type === 'worker_wage_debt') total.workforce += expense.balance_amount
    else total.expenses += expense.balance_amount
    return total
  }, { all: 0, expenses: 0, workforce: 0 }), [shown])

  return <>
    <PageHeader
      eyebrow="Rekod projek"
      title="Semua expenses"
      description="Semua kos projek termasuk baki pembekal dan hutang upah yang terakru daripada Workforce."
      action={<Link href="/expenses/baru" className="btn-primary"><Plus className="h-4 w-4" />Tambah</Link>}
    />

    <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_220px_190px]">
      <label className="relative"><Search className="field-icon" /><input className="field-control pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari expenses..." /></label>
      <label className="relative"><Filter className="field-icon" /><select className="field-control pl-11" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Semua projek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.project_no} · {project.project_name}</option>)}</select></label>
      <select className="field-control" value={status} onChange={(event) => setStatus(event.target.value as '' | ExpenseStatus)}><option value="">Semua status</option><option value="unpaid">Belum bayar</option><option value="partially_paid">Bayar sebahagian</option><option value="paid">Selesai</option></select>
    </div>

    {!loading && !error && debt.all > 0 && <section className="mb-5 grid gap-3 sm:grid-cols-3">
      <DebtSummary label="Jumlah hutang dipaparkan" value={debt.all} strong />
      <DebtSummary label="Expenses / pembekal" value={debt.expenses} />
      <DebtSummary label="Upah Workforce" value={debt.workforce} />
    </section>}

    {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={refresh} /> : !shown.length ? <EmptyBlock title="Tiada expenses ditemui" description="Ubah tapisan atau tambah rekod baharu." /> : <div className="space-y-3">{shown.map((expense) => {
      const project = projectMap.get(expense.project_id)
      const content = <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-emerald-700">{project?.project_no}</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusTone(expense.status)}`}>{statusLabel(expense.status)}</span>
            {expense.record_type === 'worker_wage_debt' && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700">Upah Workforce</span>}
          </div>
          <h2 className="mt-2 truncate font-black">{expense.description}</h2>
          <p className="mt-1 text-xs text-slate-500">{project?.project_name} · {categoryLabel(expense.category)} · {formatDate(expense.expense_date)}</p>
          {expense.record_type === 'worker_wage_debt' && <p className="mt-2 text-xs font-semibold leading-5 text-rose-700">{expense.notes}</p>}
          {expense.record_type === 'worker_wage_debt' && expense.advance_offset > 0 && <p className="mt-1 text-xs font-bold text-amber-700">Advance telah ditolak: {formatMoney(expense.advance_offset)}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black">{formatMoney(expense.total_amount)}</p>
          {expense.balance_amount > 0 && <p className="mt-1 text-xs font-semibold text-rose-600">Baki {formatMoney(expense.balance_amount)}</p>}
        </div>
      </div>

      return expense.record_type === 'expense' && expense.expense_id
        ? <Link key={expense.record_key} href={`/expenses/${expense.expense_id}`} className="card block p-4 transition hover:border-emerald-300 sm:p-5">{content}</Link>
        : <article key={expense.record_key} className="card border-rose-200 p-4 sm:p-5">{content}</article>
    })}</div>}
  </>
}

function DebtSummary({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <article className={`rounded-2xl border p-4 ${strong ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center gap-2"><Banknote className={`h-4 w-4 ${strong ? 'text-rose-700' : 'text-slate-400'}`} /><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p></div>
    <p className={`mt-2 text-lg font-black ${strong ? 'text-rose-700' : 'text-slate-900'}`}>{formatMoney(value)}</p>
  </article>
}

function _KeepReactNodeType(_: ReactNode) { return null }
