import { Banknote, CalendarDays, Filter, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  const selectedProject = projectId ? projectMap.get(Number(projectId)) : undefined
  const compactProjectView = Boolean(projectId)

  const shown = useMemo(() => expenses.filter((expense) => (
    (!projectId || expense.project_id === Number(projectId))
    && (!status || expense.status === status)
    && (!search.trim() || `${expense.description} ${expense.notes} ${projectMap.get(expense.project_id)?.project_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )), [expenses, projectId, status, search, projectMap])

  const totals = useMemo(() => shown.reduce((total, expense) => ({
    overall: total.overall + expense.total_amount,
    paid: total.paid + expense.paid_amount,
    debt: total.debt + expense.balance_amount,
    workforceDebt: total.workforceDebt + (expense.record_type === 'worker_wage_debt' ? expense.balance_amount : 0),
  }), { overall: 0, paid: 0, debt: 0, workforceDebt: 0 }), [shown])

  const dailyGroups = useMemo(() => {
    const grouped = new Map<string, ExpenseFeedItem[]>()
    shown.forEach((expense) => grouped.set(expense.expense_date, [...(grouped.get(expense.expense_date) ?? []), expense]))
    return [...grouped.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, items]) => ({
        date,
        items,
        total: items.reduce((sum, item) => sum + item.total_amount, 0),
        paid: items.reduce((sum, item) => sum + item.paid_amount, 0),
        debt: items.reduce((sum, item) => sum + item.balance_amount, 0),
      }))
  }, [shown])

  return <>
    <PageHeader
      eyebrow={compactProjectView ? selectedProject?.project_no ?? 'Rekod projek' : 'Rekod projek'}
      title={compactProjectView ? 'Expenses projek' : 'Semua expenses'}
      description={compactProjectView && selectedProject
        ? `${selectedProject.project_name} · ${selectedProject.client_name}`
        : 'Semua kos projek termasuk baki pembekal dan hutang upah yang terakru daripada Workforce.'}
      action={<Link href="/expenses/baru" className="btn-primary"><Plus className="h-4 w-4" />Tambah</Link>}
    />

    <div className={`card mb-5 grid gap-3 p-4 ${compactProjectView ? 'md:grid-cols-[1fr_190px]' : 'md:grid-cols-[1fr_220px_190px]'}`}>
      <label className="relative"><Search className="field-icon" /><input className="field-control pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari expenses..." /></label>
      {!compactProjectView && <label className="relative"><Filter className="field-icon" /><select className="field-control pl-11" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Semua projek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.project_no} · {project.project_name}</option>)}</select></label>}
      <select className="field-control" value={status} onChange={(event) => setStatus(event.target.value as '' | ExpenseStatus)}><option value="">Semua status</option><option value="unpaid">Belum bayar</option><option value="partially_paid">Bayar sebahagian</option><option value="paid">Selesai</option></select>
    </div>

    {!loading && !error && compactProjectView && <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
      <ProjectTotal label="Total keseluruhan" value={totals.overall} />
      <ProjectTotal label="Dah bayar" value={totals.paid} paid />
      <ProjectTotal label="Hutang" value={totals.debt} debt />
    </section>}

    {!loading && !error && !compactProjectView && totals.debt > 0 && <section className="mb-5 grid gap-3 sm:grid-cols-3">
      <DebtSummary label="Jumlah hutang dipaparkan" value={totals.debt} strong />
      <DebtSummary label="Expenses / pembekal" value={totals.debt - totals.workforceDebt} />
      <DebtSummary label="Upah Workforce" value={totals.workforceDebt} />
    </section>}

    {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={refresh} /> : !shown.length ? <EmptyBlock title="Tiada expenses ditemui" description="Ubah tapisan atau tambah rekod baharu." /> : compactProjectView ? <div className="space-y-4">
      {dailyGroups.map((group) => <section key={group.date} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <div><p className="text-sm font-black text-slate-900">{formatDate(group.date)}</p><p className="text-[11px] font-semibold text-slate-400">{group.items.length} rekod</p></div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total hari</p>
            <p className="text-base font-black text-slate-950">{formatMoney(group.total)}</p>
            {group.debt > 0 && <p className="text-[11px] font-bold text-rose-600">Bayar {formatMoney(group.paid)} · Hutang {formatMoney(group.debt)}</p>}
          </div>
        </header>
        <div className="divide-y divide-slate-100">{group.items.map((expense) => <CompactExpenseRow key={expense.record_key} expense={expense} />)}</div>
      </section>)}
    </div> : <div className="space-y-3">{shown.map((expense) => {
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

function CompactExpenseRow({ expense }: { expense: ExpenseFeedItem }) {
  const content = <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:px-5">
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-bold text-slate-900">{expense.description}</p>
        {expense.record_type === 'worker_wage_debt' && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-700">Upah</span>}
      </div>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{categoryLabel(expense.category)} · {statusLabel(expense.status)}{expense.advance_offset > 0 ? ` · Advance -${formatMoney(expense.advance_offset)}` : ''}</p>
    </div>
    <div className="text-right">
      <p className="text-sm font-black text-slate-950">{formatMoney(expense.total_amount)}</p>
      {expense.balance_amount > 0 && <p className="text-[10px] font-black text-rose-600">Hutang {formatMoney(expense.balance_amount)}</p>}
    </div>
  </div>

  return expense.record_type === 'expense' && expense.expense_id
    ? <Link href={`/expenses/${expense.expense_id}`} className="block transition hover:bg-slate-50">{content}</Link>
    : <article className="bg-rose-50/30">{content}</article>
}

function ProjectTotal({ label, value, paid = false, debt = false }: { label: string; value: number; paid?: boolean; debt?: boolean }) {
  const tone = debt ? 'text-rose-700' : paid ? 'text-emerald-700' : 'text-slate-950'
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-[10px]">{label}</p>
    <p className={`mt-1 text-sm font-black sm:text-lg ${tone}`}>{formatMoney(value)}</p>
  </article>
}

function DebtSummary({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <article className={`rounded-2xl border p-4 ${strong ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center gap-2"><Banknote className={`h-4 w-4 ${strong ? 'text-rose-700' : 'text-slate-400'}`} /><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p></div>
    <p className={`mt-2 text-lg font-black ${strong ? 'text-rose-700' : 'text-slate-900'}`}>{formatMoney(value)}</p>
  </article>
}
