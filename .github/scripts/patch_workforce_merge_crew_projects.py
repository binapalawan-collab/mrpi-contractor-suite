from pathlib import Path
import re

path = Path('apps/mrpi-workforce/src/pages/WagePage.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'missing pattern: {label}')
    text = text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, label: str):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'expected one match for {label}, got {count}')

sub_once(
    r"type CrewProjectSummary = \{.*?\n\}\n\ntype CrewPaymentRow = \{.*?\n\}",
    """type CrewProjectSummary = {
  leader: Worker
  project: Project
  workerCount: number
  workDays: number
  outstanding: number
  advances: number
  groupAdvances: number
  netPay: number
  start: string
  end: string
}

type CrewLeaderSummary = {
  leader: Worker
  projects: CrewProjectSummary[]
  workerCount: number
  workDays: number
  outstanding: number
  advances: number
  groupAdvances: number
  netPay: number
  start: string
  end: string
}

type CrewPaymentRow = {
  worker: Worker
  project: Project
  outstanding: number
  advances: number
  cash: number
  workDays: number
}

type CrewProjectPaymentSummary = {
  project: Project
  rows: CrewPaymentRow[]
  outstanding: number
  personalAdvances: number
  groupAdvances: number
  advances: number
  cash: number
}""",
    'crew types',
)

replace_once("  const [crewProjectId, setCrewProjectId] = useState('')\n", "", 'crew project state')

anchor = "  }, [advances, groups, workers])\n\n  const selectedWorker ="
insert = """  }, [advances, groups, workers])

  const crewLeaderSummaries = useMemo(() => {
    const grouped = new Map<number, CrewProjectSummary[]>()
    for (const summary of crewProjectSummaries) {
      grouped.set(summary.leader.id, [...(grouped.get(summary.leader.id) ?? []), summary])
    }

    return [...grouped.entries()].flatMap(([leaderId, projectSummaries]) => {
      const leader = workerMap.get(leaderId)
      if (!leader) return []
      const projectIds = new Set(projectSummaries.map((summary) => summary.project.id))
      const crewIds = new Set([
        leader.id,
        ...workers.filter((worker) => worker.crew_leader_id === leader.id).map((worker) => worker.id),
      ])
      const owingWorkerIds = new Set(groups
        .filter((group) => projectIds.has(group.project.id) && crewIds.has(group.worker.id) && group.worker.pay_type === 'daily')
        .map((group) => group.worker.id))
      const dates = projectSummaries.flatMap((summary) => [summary.start, summary.end]).sort()
      return [{
        leader,
        projects: projectSummaries,
        workerCount: owingWorkerIds.size,
        workDays: projectSummaries.reduce((sum, summary) => sum + summary.workDays, 0),
        outstanding: roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.outstanding, 0)),
        advances: roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.advances, 0)),
        groupAdvances: roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.groupAdvances, 0)),
        netPay: roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.netPay, 0)),
        start: dates[0]!,
        end: dates.at(-1)!,
      } satisfies CrewLeaderSummary]
    }).sort((a, b) => a.leader.name.localeCompare(b.leader.name))
  }, [crewProjectSummaries, groups, workerMap, workers])

  const selectedWorker ="""
replace_once(anchor, insert, 'leader summaries insertion')

start = text.index("  const selectedCrewLeader =")
end = text.index("  useEffect(() => {\n    if (!payOpen", start)
new_block = """  const selectedCrewLeader = workers.find((worker) => worker.id === Number(crewHeadId) && worker.is_crew_leader)
  const crewPaymentRows = useMemo(() => {
    if (!selectedCrewLeader) return []
    const crewIds = new Set([
      selectedCrewLeader.id,
      ...workers.filter((worker) => worker.crew_leader_id === selectedCrewLeader.id).map((worker) => worker.id),
    ])
    return projects.flatMap((project) => workers.flatMap((worker) => {
      if (!crewIds.has(worker.id) || worker.pay_type !== 'daily') return []
      const rows = attendance.filter((row) => (
        row.worker_id === worker.id
        && row.project_id === project.id
        && row.status !== 'absent'
        && row.attendance_date >= crewPeriodStart
        && row.attendance_date <= crewPeriodEnd
        && outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) > 0
      ))
      const outstanding = roundMoney(rows.reduce((sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount), 0))
      if (outstanding <= 0) return []
      const workerAdvanceRows = advances.filter((advance) => advance.worker_id === worker.id && advance.project_id === project.id && (advance.advance_scope ?? 'worker') === 'worker')
      const advanceTotal = deductibleAdvances(workerAdvanceRows, outstanding)
      return [{
        worker,
        project,
        outstanding,
        advances: advanceTotal,
        cash: roundMoney(outstanding - advanceTotal),
        workDays: rows.reduce((sum, row) => sum + workUnits(row), 0),
      } satisfies CrewPaymentRow]
    }))
  }, [advances, attendance, crewPeriodEnd, crewPeriodStart, projects, selectedCrewLeader, workers])

  const crewProjectPaymentSummaries = useMemo(() => {
    if (!selectedCrewLeader) return []
    const groupedRows = new Map<number, CrewPaymentRow[]>()
    for (const row of crewPaymentRows) {
      groupedRows.set(row.project.id, [...(groupedRows.get(row.project.id) ?? []), row])
    }
    return [...groupedRows.entries()].flatMap(([currentProjectId, rows]) => {
      const project = projects.find((item) => item.id === currentProjectId)
      if (!project) return []
      const outstanding = roundMoney(rows.reduce((sum, row) => sum + row.outstanding, 0))
      const personalAdvances = roundMoney(rows.reduce((sum, row) => sum + row.advances, 0))
      const groupAdvanceRows = advances.filter((advance) => (
        advance.worker_id === selectedCrewLeader.id
        && advance.project_id === project.id
        && advance.advance_scope === 'crew'
      ))
      const groupAdvances = deductibleAdvances(groupAdvanceRows, Math.max(0, roundMoney(outstanding - personalAdvances)))
      const advancesTotal = roundMoney(personalAdvances + groupAdvances)
      return [{
        project,
        rows,
        outstanding,
        personalAdvances,
        groupAdvances,
        advances: advancesTotal,
        cash: roundMoney(Math.max(0, outstanding - advancesTotal)),
      } satisfies CrewProjectPaymentSummary]
    }).sort((a, b) => projectOptionLabel(a.project).localeCompare(projectOptionLabel(b.project)))
  }, [advances, crewPaymentRows, projects, selectedCrewLeader])

  const crewPaymentProjectIds = useMemo(
    () => crewProjectPaymentSummaries.map((summary) => summary.project.id),
    [crewProjectPaymentSummaries],
  )

  const crewTotals = useMemo(() => crewProjectPaymentSummaries.reduce((totals, summary) => ({
    outstanding: roundMoney(totals.outstanding + summary.outstanding),
    personalAdvances: roundMoney(totals.personalAdvances + summary.personalAdvances),
    groupAdvances: roundMoney(totals.groupAdvances + summary.groupAdvances),
    advances: roundMoney(totals.advances + summary.advances),
    cash: roundMoney(totals.cash + summary.cash),
  }), { outstanding: 0, personalAdvances: 0, groupAdvances: 0, advances: 0, cash: 0 }), [crewProjectPaymentSummaries])

"""
text = text[:start] + new_block + text[end:]

sub_once(
    r"  const crewPaymentError = .*?\n\n  function resetSelectedAdvances",
    """  const crewPaymentError = !selectedCrewLeader
    ? 'Kepala Tukang tidak sah.'
    : crewPeriodEnd < crewPeriodStart
      ? 'Tempoh bayaran kumpulan tidak sah.'
      : !crewPaymentProjectIds.length
        ? 'Tiada baki upah pekerja kumpulan dalam tempoh ini.'
        : ''

  function resetSelectedAdvances""",
    'crew payment error',
)

sub_once(
    r"  function openCrewPayment\(summary: CrewProjectSummary\) \{.*?\n  \}\n\n  function selectWorker",
    """  function openCrewPayment(summary: CrewLeaderSummary) {
    setCrewHeadId(String(summary.leader.id))
    setCrewPeriodStart(summary.start)
    setCrewPeriodEnd(summary.end)
    setCrewPayOpen(true)
  }

  function selectWorker""",
    'open crew payment',
)

replace_once(
    """      const { error: crewPaymentRequestError } = await supabase.rpc('record_worker_crew_wage_payment', {
        p_head_worker_id: Number(crewHeadId),
        p_project_id: Number(crewProjectId),
        p_period_start: crewPeriodStart,
        p_period_end: crewPeriodEnd,
        p_payment_date: String(form.get('payment_date')),
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })""",
    """      const { error: crewPaymentRequestError } = await supabase.rpc('record_worker_crew_wage_payment_all_projects', {
        p_head_worker_id: Number(crewHeadId),
        p_project_ids: crewPaymentProjectIds,
        p_period_start: crewPeriodStart,
        p_period_end: crewPeriodEnd,
        p_payment_date: String(form.get('payment_date')),
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })""",
    'crew payment rpc',
)

start = text.index("    {crewPayOpen && selectedCrewLeader && selectedCrewProject && <Modal")
end = text.index("    <div className=\"space-y-3\">\n      {workerSummaries.map", start)
replacement = """    {crewPayOpen && selectedCrewLeader && <Modal title={`Bayar kumpulan · ${selectedCrewLeader.name}`} close={() => setCrewPayOpen(false)}>
      <form onSubmit={payCrew} className="space-y-4">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-violet-700">Kepala Tukang</p>
          <p className="mt-1 text-xl font-black text-slate-950">{selectedCrewLeader.name}</p>
          <p className="mt-1 text-xs text-slate-500">Semua projek yang masih tertunggak disatukan dalam bayaran ini. Rekod setiap projek dan pekerja kekal berasingan.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">Dari</span><input type="date" className="field-control" value={crewPeriodStart} onChange={(event) => setCrewPeriodStart(event.target.value)} /></label>
          <label><span className="field-label">Hingga</span><input type="date" className="field-control" value={crewPeriodEnd} onChange={(event) => setCrewPeriodEnd(event.target.value)} /></label>
        </div>

        <div className="space-y-3">
          {crewProjectPaymentSummaries.map((projectSummary) => <div key={projectSummary.project.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{projectOptionLabel(projectSummary.project)}</p>
                <p className="mt-1 text-xs text-slate-500">{projectSummary.rows.length} pekerja masih berbaki</p>
              </div>
              <strong className="text-lg text-sky-700">{formatMoney(projectSummary.cash)}</strong>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Hutang</span><strong>{formatMoney(projectSummary.outstanding)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Pinjaman</span><strong className="text-amber-700">{formatMoney(projectSummary.advances)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Tunai</span><strong className="text-sky-700">{formatMoney(projectSummary.cash)}</strong></div>
            </div>
            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {projectSummary.rows.map((row) => <div key={`${row.project.id}:${row.worker.id}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span><strong className="text-slate-800">{row.worker.name}</strong> · {formatDays(row.workDays)}</span>
                <span className="text-slate-500">Hutang {formatMoney(row.outstanding)}{row.advances > 0 ? ` · Pinjaman ${formatMoney(row.advances)}` : ''}</span>
              </div>)}
            </div>
          </div>)}
        </div>

        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <div className="flex justify-between text-sm text-slate-300"><span>Jumlah hutang semua projek</span><strong>{formatMoney(crewTotals.outstanding)}</strong></div>
          <div className="mt-2 flex justify-between text-sm text-amber-200"><span>Tolak pinjaman pekerja</span><strong>{formatMoney(crewTotals.personalAdvances)}</strong></div>
          <div className="mt-2 flex justify-between text-sm text-amber-300"><span>Tolak pinjaman kumpulan</span><strong>{formatMoney(crewTotals.groupAdvances)}</strong></div>
          <div className="mt-3 flex justify-between border-t border-slate-700 pt-3"><span className="font-black">Tunai beri kepada {selectedCrewLeader.name}</span><strong className="text-xl text-sky-300">{formatMoney(crewTotals.cash)}</strong></div>
        </div>

        <label><span className="field-label">Tarikh bayar</span><input name="payment_date" type="date" className="field-control" required defaultValue={today} /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue={'cash' satisfies PaymentMethod}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" placeholder="Contoh: diserahkan kepada kepala tukang untuk semua tapak tertunggak" /></label>
        {crewPaymentError && <p className="alert-error flex gap-2"><CircleAlert className="h-5 w-5 shrink-0" />{crewPaymentError}</p>}
        <button className="btn-primary w-full" disabled={saving || Boolean(crewPaymentError)}>{saving ? 'Merekod...' : `Sahkan bayaran semua projek ${formatMoney(crewTotals.cash)}`}</button>
      </form>
    </Modal>}

    {crewLeaderSummaries.length > 0 && <section className="mb-7">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700"><Users className="h-4 w-4" /></span>
        <div><h2 className="font-black">Bayaran melalui Kepala Tukang</h2><p className="text-xs text-slate-500">Semua tapak tertunggak untuk kepala tukang yang sama disatukan dalam satu bayaran.</p></div>
      </div>
      <div className="space-y-3">{crewLeaderSummaries.map((summary) => <article key={summary.leader.id} className="card border-violet-100 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 xl:w-64">
            <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">KEPALA TUKANG</span>
            <h3 className="mt-2 text-xl font-black">{summary.leader.name}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">{summary.projects.length} projek tertunggak · {summary.projects.map((item) => projectOptionLabel(item.project)).join(' · ')}</p>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-4 xl:max-w-3xl">
            <SimpleMetric label="Pekerja" value={`${summary.workerCount} orang`} />
            <SimpleMetric label="Hutang upah" value={formatMoney(summary.outstanding)} />
            <SimpleMetric label={summary.groupAdvances > 0 ? "Pinjaman · termasuk group" : "Pinjaman"} value={formatMoney(summary.advances)} tone="amber" />
            <SimpleMetric label="Tunai ke ketua" value={formatMoney(summary.netPay)} tone="sky" strong />
          </div>
          <button onClick={() => openCrewPayment(summary)} className="btn-primary shrink-0"><Users className="h-4 w-4" />Bayar kumpulan</button>
        </div>
      </article>)}</div>
    </section>}

"""
text = text[:start] + replacement + text[end:]

path.write_text(text)
print('patched', path)
