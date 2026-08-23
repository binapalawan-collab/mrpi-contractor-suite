import { AlertTriangle, ArrowRight, Banknote, CircleDollarSign, Plus, TrendingUp, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { ErrorBlock, LoadingBlock } from '../components/State'
import { formatDate, formatMoney, formatSignedMoney, statusLabel, statusTone } from '../lib/expenses'
import { errorMessage } from '../lib/errors'
import { loadExpenses, loadProjectOverview } from '../lib/queries'
import type { Expense, ProjectCostOverview } from '../types/domain'

const projectLabel=(project:ProjectCostOverview)=>project.project_alias?.trim()||project.project_no

export function DashboardPage() {
  const [projects, setProjects] = useState<ProjectCostOverview[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = () => {
    setLoading(true)
    setError('')
    Promise.all([loadProjectOverview(), loadExpenses()])
      .then(([projectRows, expenseRows]) => {
        setProjects(projectRows)
        setExpenses(expenseRows.slice(0, 6))
      })
      .catch((caughtError) => setError(errorMessage(caughtError)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const totals = useMemo(() => projects.reduce((total, project) => ({
    contract: total.contract + project.current_contract_amount,
    committed: total.committed + project.committed_expenses,
    paid: total.paid + project.paid_expenses,
    debt: total.debt + project.outstanding_expenses,
    profit: total.profit + project.estimated_gross_profit,
    pendingVariation: total.pendingVariation + project.pending_variation_amount,
    pendingCount: total.pendingCount + project.pending_variation_count,
    projectedContract: total.projectedContract + project.projected_contract_amount,
    projectedProfit: total.projectedProfit + project.projected_gross_profit,
  }), {
    contract: 0,
    committed: 0,
    paid: 0,
    debt: 0,
    profit: 0,
    pendingVariation: 0,
    pendingCount: 0,
    projectedContract: 0,
    projectedProfit: 0,
  }), [projects])

  if (loading) return <LoadingBlock label="Mengira kedudukan semua projek..." />
  if (error) return <ErrorBlock message={error} retry={refresh} />

  return <>
    <PageHeader eyebrow="Dashboard expenses" title="Kos sebenar projek" description="Kos komited termasuk expenses, hutang pembekal dan upah Workforce yang telah diperoleh tetapi belum dibayar." action={<Link href="/expenses/baru" className="btn-primary"><Plus className="h-4 w-4" />Tambah expenses</Link>} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={CircleDollarSign} label="Kontrak diluluskan" value={formatMoney(totals.contract)} tone="slate" />
      <Metric icon={WalletCards} label="Kos komited" value={formatMoney(totals.committed)} tone="amber" />
      <Metric icon={Banknote} label="Tunai dibayar" value={formatMoney(totals.paid)} tone="rose" />
      <Metric icon={TrendingUp} label="Untung kasar diluluskan" value={formatMoney(totals.profit)} tone="emerald" />
    </section>
    {totals.pendingCount > 0 && <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-black">{totals.pendingCount} VO belum diluluskan</p>
            <p className="font-black text-amber-800">{formatSignedMoney(totals.pendingVariation)}</p>
          </div>
          <p className="mt-1 text-sm leading-6 text-amber-900">Belum mengubah kontrak secara legal. Jika semuanya diluluskan: kontrak <strong>{formatMoney(totals.projectedContract)}</strong> dan untung kasar <strong>{formatMoney(totals.projectedProfit)}</strong>.</p>
        </div>
      </div>
    </section>}
    <section className="mt-7 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <div>
        <div className="section-title"><div><h2>Prestasi projek</h2><p>Kuning = sudah dibayar. Merah = hutang/belum dibayar, termasuk upah Workforce.</p></div><Link href="/projek">Lihat semua <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="space-y-3">{projects.slice(0, 5).map((project) => {
          const committedPct = project.current_contract_amount ? project.committed_expenses / project.current_contract_amount * 100 : 0
          const projectedPct = project.projected_contract_amount ? project.committed_expenses / project.projected_contract_amount * 100 : 0
          const hasPendingVariation = project.pending_variation_count > 0
          const alias = project.project_alias?.trim()
          return <article key={project.project_id} className="card p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-emerald-700">{projectLabel(project)}</p>{!alias&&<h3 className="mt-1 font-black">{project.project_name}</h3>}<p className="mt-1 text-xs text-slate-500">{project.client_name}</p></div><p className="text-right text-sm font-black text-emerald-700">{formatMoney(project.estimated_gross_profit)}<span className="block text-[11px] font-semibold text-slate-400">untung diluluskan</span></p></div>
            {hasPendingVariation && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-black text-amber-900"><span>{project.pending_variation_count} VO belum diluluskan</span><span>{formatSignedMoney(project.pending_variation_amount)}</span></div>
              <p className="mt-1 text-xs leading-5 text-amber-800">Jika diluluskan: kontrak <strong>{formatMoney(project.projected_contract_amount)}</strong> · untung <strong>{formatMoney(project.projected_gross_profit)}</strong> · kos <strong>{projectedPct.toFixed(1)}%</strong>.</p>
            </div>}
            <ProjectCostBar project={project} />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Dibayar {formatMoney(project.paid_expenses)}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Hutang {formatMoney(project.outstanding_expenses)}</span>
              <span className="ml-auto">Kos komited {committedPct.toFixed(1)}% kontrak</span>
            </div>
            {project.unpaid_wages > 0 && <p className="mt-1.5 text-[11px] font-semibold text-rose-700">Hutang termasuk upah Workforce belum dibayar {formatMoney(project.unpaid_wages)}.</p>}
          </article>
        })}{!projects.length && <p className="card p-6 text-sm text-slate-500">Belum ada projek daripada Contractor Suite.</p>}</div>
      </div>
      <div>
        <div className="section-title"><div><h2>Expenses terkini</h2><p>Rekod terbaru semua projek.</p></div><Link href="/expenses">Semua <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="card divide-y divide-slate-100 overflow-hidden">{expenses.map((expense) => <Link key={expense.id} href={`/expenses/${expense.id}`} className="block p-4 transition hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(expense.expense_date)}</p></div><div className="text-right"><p className="text-sm font-black">{formatMoney(expense.total_amount)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${statusTone(expense.status)}`}>{statusLabel(expense.status)}</span></div></div></Link>)}{!expenses.length && <p className="p-6 text-sm text-slate-500">Belum ada expenses.</p>}</div>
      </div>
    </section>
  </>
}

function ProjectCostBar({ project }: { project: ProjectCostOverview }) {
  const contract = project.current_contract_amount
  const paidPct = contract > 0 ? Math.min(100, project.paid_expenses / contract * 100) : 0
  const rawDebtPct = contract > 0 ? Math.max(0, project.outstanding_expenses / contract * 100) : 0
  const debtPct = Math.min(Math.max(0, 100 - paidPct), rawDebtPct)

  return <div className="mt-4 h-6 overflow-hidden rounded-full bg-slate-100" aria-label={`Dibayar ${formatMoney(project.paid_expenses)}, hutang ${formatMoney(project.outstanding_expenses)}`}>
    <div className="flex h-full w-full">
      {paidPct > 0 && <div title={`Dibayar ${formatMoney(project.paid_expenses)}`} className="flex h-full shrink-0 items-center justify-center overflow-hidden bg-amber-400 px-1 text-[10px] font-black text-slate-950" style={{ width: `${paidPct}%` }}>{paidPct >= 12 ? compactMoney(project.paid_expenses) : ''}</div>}
      {debtPct > 0 && <div title={`Belum dibayar ${formatMoney(project.outstanding_expenses)}`} className="flex h-full shrink-0 items-center justify-center overflow-hidden bg-rose-500 px-1 text-[10px] font-black text-white" style={{ width: `${debtPct}%` }}>{debtPct >= 12 ? compactMoney(project.outstanding_expenses) : ''}</div>}
    </div>
  </div>
}

function compactMoney(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1000) return `RM ${(value / 1000).toLocaleString('ms-MY', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`
  return `RM ${value.toLocaleString('ms-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof CircleDollarSign; label: string; value: string; tone: 'slate' | 'amber' | 'rose' | 'emerald' }) {
  const colors = { slate: 'bg-slate-950 text-white', amber: 'bg-amber-50 text-amber-800', rose: 'bg-rose-50 text-rose-800', emerald: 'bg-emerald-600 text-white' }
  return <article className={`rounded-2xl p-5 ${colors[tone]}`}><Icon className="h-5 w-5 opacity-70" /><p className="mt-5 text-xs font-black uppercase tracking-[.12em] opacity-70">{label}</p><p className="mt-1 text-xl font-black">{value}</p></article>
}
