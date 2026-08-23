import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { formatMoney, formatSignedMoney } from '../lib/expenses'
import { errorMessage } from '../lib/errors'
import { loadProjectOverview } from '../lib/queries'
import type { ProjectCostOverview } from '../types/domain'

function projectLabel(project: ProjectCostOverview) {
  return project.project_alias?.trim() || project.project_no
}

export function ProjectListPage() {
  const [rows, setRows] = useState<ProjectCostOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = () => {
    setLoading(true)
    loadProjectOverview().then(setRows).catch((caughtError) => setError(errorMessage(caughtError))).finally(() => setLoading(false))
  }
  useEffect(refresh, [])

  return <>
    <PageHeader eyebrow="Tally Contractor Suite" title="Kos mengikut projek" description="Kontrak semasa hanya memasukkan VO yang telah diluluskan. VO belum lulus ditunjukkan sebagai unjuran." />
    {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={refresh} /> : !rows.length ? <EmptyBlock title="Belum ada projek" description="Terima sebutharga dalam Contractor Suite untuk menghasilkan projek." /> : <div className="grid gap-4 lg:grid-cols-2">{rows.map((project) => {
      const margin = project.current_contract_amount ? project.estimated_gross_profit / project.current_contract_amount * 100 : 0
      const hasPendingVariation = project.pending_variation_count > 0
      const alias = project.project_alias?.trim()
      return <article key={project.project_id} className="card overflow-hidden">
        <div className="border-b border-slate-100 p-5"><p className="text-xs font-black text-emerald-700">{projectLabel(project)}</p>{!alias && <h2 className="mt-1 text-lg font-black">{project.project_name}</h2>}<p className="mt-1 text-sm text-slate-500">{project.client_name}</p></div>
        <div className="grid grid-cols-2 gap-px bg-slate-100"><Fact label="Kontrak diluluskan" value={formatMoney(project.current_contract_amount)} icon={Wallet} /><Fact label="Expenses" value={formatMoney(project.committed_expenses)} icon={TrendingDown} /><Fact label="Tunai diterima" value={formatMoney(project.customer_received)} icon={Wallet} /><Fact label="Untung diluluskan" value={formatMoney(project.estimated_gross_profit)} icon={TrendingUp} accent /></div>
        {hasPendingVariation && <div className="border-t border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs font-black text-amber-900"><span>{project.pending_variation_count} VO belum diluluskan</span><span>{formatSignedMoney(project.pending_variation_amount)}</span></div><p className="mt-1 text-xs leading-5 text-amber-800">Jika diluluskan: kontrak <strong>{formatMoney(project.projected_contract_amount)}</strong> dan untung <strong>{formatMoney(project.projected_gross_profit)}</strong>.</p></div></div></div>}
        <div className="flex items-center justify-between p-4"><p className={`text-xs font-black ${margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Margin diluluskan {margin.toFixed(1)}%</p><Link href={`/expenses?project=${project.project_id}`} className="inline-flex items-center gap-1 text-xs font-black text-slate-700">Expenses <ArrowRight className="h-4 w-4" /></Link></div>
      </article>
    })}</div>}
  </>
}

function Fact({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Wallet; accent?: boolean }) {
  return <div className="bg-white p-4"><Icon className={`h-4 w-4 ${accent ? 'text-emerald-600' : 'text-slate-400'}`} /><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-sm font-black ${accent ? 'text-emerald-700' : ''}`}>{value}</p></div>
}
