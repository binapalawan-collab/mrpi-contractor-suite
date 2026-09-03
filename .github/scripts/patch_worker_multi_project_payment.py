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
    r"(type WorkerWageSummary = \{.*?\n\}\n\n)",
    r"\1type WorkerProjectPaymentSummary = {\n  project: Project\n  rows: Attendance[]\n  outstanding: number\n  workDays: number\n  start: string\n  end: string\n}\n\n",
    'worker project payment type',
)

start = text.index("  const selectedWorker = workers.find")
end = text.index("  const selectedCrewLeader =", start)
new_block = """  const selectedWorker = workers.find((worker) => worker.id === Number(workerId))

  const workerProjectPaymentSummaries = useMemo(() => {
    if (!selectedWorker || selectedWorker.pay_type !== 'daily') return []
    return projects.flatMap((project) => {
      const rows = attendance.filter((row) => (
        row.worker_id === selectedWorker.id
        && row.project_id === project.id
        && row.status !== 'absent'
        && row.attendance_date >= periodStart
        && row.attendance_date <= periodEnd
        && outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) > 0
      ))
      if (!rows.length) return []
      const dates = rows.map((row) => row.attendance_date).sort()
      return [{
        project,
        rows,
        outstanding: roundMoney(rows.reduce(
          (sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount),
          0,
        )),
        workDays: rows.reduce((sum, row) => sum + workUnits(row), 0),
        start: dates[0]!,
        end: dates.at(-1)!,
      } satisfies WorkerProjectPaymentSummary]
    }).sort((a, b) => a.start.localeCompare(b.start) || a.project.id - b.project.id)
  }, [attendance, periodEnd, periodStart, projects, selectedWorker])

  const workerPaymentProjectIds = useMemo(
    () => workerProjectPaymentSummaries.map((summary) => summary.project.id),
    [workerProjectPaymentSummaries],
  )

  const matchingRows = selectedWorker?.pay_type === 'daily'
    ? workerProjectPaymentSummaries.flatMap((summary) => summary.rows)
    : attendance.filter((row) => (
      row.worker_id === Number(workerId)
      && row.project_id === Number(projectId)
      && row.status !== 'absent'
      && row.attendance_date >= periodStart
      && row.attendance_date <= periodEnd
      && outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) > 0
    ))

  const outstandingTotal = roundMoney(matchingRows.reduce(
    (sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount),
    0,
  ))

  const eligibleAdvances = advances.filter((advance) => (
    advance.worker_id === Number(workerId)
    && (advance.advance_scope ?? 'worker') === 'worker'
    && (selectedWorker?.pay_type === 'daily'
      ? workerPaymentProjectIds.includes(advance.project_id)
      : advance.project_id === Number(projectId))
  ))

  const deduction = roundMoney(eligibleAdvances
    .filter((advance) => selectedAdvances.includes(advance.id))
    .reduce((sum, advance) => sum + advance.amount, 0))
  const contractGross = roundMoney(Number(grossInput || 0))
  const cashAmount = selectedWorker?.pay_type === 'daily'
    ? roundMoney(Number(cashInput || 0))
    : roundMoney(Math.max(0, contractGross - deduction))
  const settlementTotal = selectedWorker?.pay_type === 'daily'
    ? roundMoney(cashAmount + deduction)
    : contractGross
  const balanceAfterPayment = selectedWorker?.pay_type === 'daily'
    ? roundMoney(Math.max(0, outstandingTotal - settlementTotal))
    : 0
  const availableForPayment = selectedWorker?.pay_type === 'daily' ? outstandingTotal : contractGross

  const selectedAdvanceTotalsByProject = useMemo(() => {
    const totals = new Map<number, number>()
    for (const advance of eligibleAdvances) {
      if (!selectedAdvances.includes(advance.id)) continue
      totals.set(advance.project_id, roundMoney((totals.get(advance.project_id) ?? 0) + advance.amount))
    }
    return totals
  }, [eligibleAdvances, selectedAdvances])

  const advanceProjectError = selectedWorker?.pay_type === 'daily'
    ? workerProjectPaymentSummaries.some((summary) => (
      (selectedAdvanceTotalsByProject.get(summary.project.id) ?? 0) > summary.outstanding
    ))
    : false

  const workerProjectPaymentBreakdown = useMemo(() => {
    let remainingCash = selectedWorker?.pay_type === 'daily' ? cashAmount : 0
    return workerProjectPaymentSummaries.map((summary) => {
      const advanceDeduction = selectedAdvanceTotalsByProject.get(summary.project.id) ?? 0
      const cashCapacity = Math.max(0, roundMoney(summary.outstanding - advanceDeduction))
      const cash = roundMoney(Math.min(remainingCash, cashCapacity))
      remainingCash = roundMoney(Math.max(0, remainingCash - cash))
      const settled = roundMoney(cash + advanceDeduction)
      return {
        ...summary,
        advanceDeduction,
        cash,
        settled,
        balance: roundMoney(Math.max(0, summary.outstanding - settled)),
      }
    })
  }, [cashAmount, selectedAdvanceTotalsByProject, selectedWorker?.pay_type, workerProjectPaymentSummaries])

"""
text = text[:start] + new_block + text[end:]

sub_once(
    r"  let paymentError = ''\n.*?\n\n  const crewPaymentError =",
    """  let paymentError = ''
  if (!selectedWorker) paymentError = 'Pilih pekerja.'
  else if (periodEnd < periodStart) paymentError = 'Tempoh bayaran tidak sah.'
  else if (selectedWorker.pay_type === 'daily' && !workerPaymentProjectIds.length) {
    paymentError = 'Tiada baki upah attendance dalam tempoh ini atau kadar hari masih RM0.'
  } else if (selectedWorker.pay_type === 'contract' && !projectId) {
    paymentError = 'Pilih projek untuk bayaran pekerja kontrak.'
  } else if (selectedWorker.pay_type === 'contract' && contractGross <= 0) {
    paymentError = 'Masukkan upah kontrak untuk bayaran ini.'
  } else if (advanceProjectError) {
    paymentError = 'Pinjaman dipilih melebihi baki upah bagi salah satu projek.'
  } else if (deduction > availableForPayment) {
    paymentError = 'Pinjaman dipilih melebihi jumlah upah untuk bayaran ini.'
  } else if (cashAmount < 0 || settlementTotal <= 0) {
    paymentError = 'Jumlah bayaran mesti melebihi RM0.'
  } else if (selectedWorker.pay_type === 'daily' && settlementTotal > outstandingTotal) {
    paymentError = 'Tunai dan pinjaman melebihi baki upah.'
  }

  const crewPaymentError =""",
    'payment error block',
)

sub_once(
    r"  function setGroupForPayment\(group: WageGroup\) \{.*?\n  \}\n\n",
    "",
    'remove group payment helper',
)

sub_once(
    r"  function openWorkerPayment\(summary: WorkerWageSummary\) \{.*?\n  \}\n\n  function openPayment\(\) \{.*?\n  \}\n\n  function openCrewPayment",
    """  function openWorkerPayment(summary: WorkerWageSummary) {
    const dates = summary.groups.flatMap((group) => [group.start, group.end]).sort()
    setWorkerId(String(summary.worker.id))
    if (summary.groups[0]) setProjectId(String(summary.groups[0].project.id))
    if (dates.length) {
      setPeriodStart(dates[0]!)
      setPeriodEnd(dates.at(-1)!)
    }
    setGrossInput('')
    setCashInput('')
    resetSelectedAdvances()
    setPayOpen(true)
  }

  function openPayment() {
    const worker = workers.find((item) => String(item.id) === workerId) ?? workers[0]
    if (worker) {
      const workerGroups = groups.filter((item) => item.worker.id === worker.id)
      const dates = workerGroups.flatMap((group) => [group.start, group.end]).sort()
      setWorkerId(String(worker.id))
      if (workerGroups[0]) setProjectId(String(workerGroups[0].project.id))
      if (dates.length) {
        setPeriodStart(dates[0]!)
        setPeriodEnd(dates.at(-1)!)
      }
    }
    setGrossInput('')
    setCashInput('')
    resetSelectedAdvances()
    setPayOpen(true)
  }

  function openCrewPayment""",
    'open worker payment functions',
)

sub_once(
    r"  function selectWorker\(value: string\) \{.*?\n  \}\n\n  function selectProject",
    """  function selectWorker(value: string) {
    setWorkerId(value)
    const workerGroups = groups.filter((item) => item.worker.id === Number(value))
    const dates = workerGroups.flatMap((group) => [group.start, group.end]).sort()
    if (workerGroups[0]) setProjectId(String(workerGroups[0].project.id))
    if (dates.length) {
      setPeriodStart(dates[0]!)
      setPeriodEnd(dates.at(-1)!)
    }
    resetSelectedAdvances()
  }

  function selectProject""",
    'select worker',
)

old_rpc = """      const { error: paymentRequestError } = await supabase.rpc('record_worker_wage_payment_partial', {
        p_worker_id: Number(workerId),
        p_project_id: Number(projectId),
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_payment_date: String(form.get('payment_date')),
        p_gross_amount: selectedWorker.pay_type === 'contract' ? contractGross : null,
        p_cash_amount: selectedWorker.pay_type === 'daily' ? cashAmount : null,
        p_advance_ids: selectedAdvances,
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })
      if (paymentRequestError) throw paymentRequestError"""
new_rpc = """      const paymentResult = selectedWorker.pay_type === 'daily'
        ? await supabase.rpc('record_worker_wage_payment_all_projects_partial', {
          p_worker_id: Number(workerId),
          p_project_ids: workerPaymentProjectIds,
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_payment_date: String(form.get('payment_date')),
          p_cash_amount: cashAmount,
          p_advance_ids: selectedAdvances,
          p_payment_method: String(form.get('payment_method')),
          p_notes: String(form.get('notes') || ''),
        })
        : await supabase.rpc('record_worker_wage_payment_partial', {
          p_worker_id: Number(workerId),
          p_project_id: Number(projectId),
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_payment_date: String(form.get('payment_date')),
          p_gross_amount: contractGross,
          p_cash_amount: null,
          p_advance_ids: selectedAdvances,
          p_payment_method: String(form.get('payment_method')),
          p_notes: String(form.get('notes') || ''),
        })
      if (paymentResult.error) throw paymentResult.error"""
replace_once(old_rpc, new_rpc, 'payment rpc')

old_project_field = """        <label>
          <span className=\"field-label\">Projek</span>
          <select className=\"field-control\" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}
          </select>
        </label>"""
new_project_field = """        {selectedWorker?.pay_type === 'contract' && <label>
          <span className=\"field-label\">Projek</span>
          <select className=\"field-control\" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}
          </select>
        </label>}"""
replace_once(old_project_field, new_project_field, 'conditional contract project field')

old_daily_summary = """        {selectedWorker?.pay_type === 'daily'
          ? <div className=\"rounded-2xl border border-sky-200 bg-sky-50 p-4\">
            <p className=\"text-xs font-black uppercase tracking-wider text-sky-700\">Hutang upah dalam tempoh</p>
            <p className=\"mt-1 text-2xl font-black text-slate-950\">{formatMoney(outstandingTotal)}</p>
            <p className=\"mt-1 text-xs text-slate-500\">{matchingRows.reduce((sum, row) => sum + workUnits(row), 0)} hari kerja berbaki.</p>
          </div>
          : <label>
            <span className=\"field-label\">Upah kontrak untuk bayaran ini</span>
            <input type=\"number\" min=\"0.01\" step=\"0.01\" required className=\"field-control\" value={grossInput} onChange={(event) => setGrossInput(event.target.value)} />
          </label>}"""
new_daily_summary = """        {selectedWorker?.pay_type === 'daily'
          ? <>
            <div className=\"rounded-2xl border border-sky-200 bg-sky-50 p-4\">
              <p className=\"text-xs font-black uppercase tracking-wider text-sky-700\">Hutang upah semua projek dalam tempoh</p>
              <p className=\"mt-1 text-2xl font-black text-slate-950\">{formatMoney(outstandingTotal)}</p>
              <p className=\"mt-1 text-xs text-slate-500\">{formatDays(matchingRows.reduce((sum, row) => sum + workUnits(row), 0))} berbaki · {workerProjectPaymentSummaries.length} projek.</p>
            </div>

            {workerProjectPaymentBreakdown.length > 0 && <div className=\"rounded-2xl border border-slate-200 bg-white p-4\">
              <p className=\"text-xs font-black uppercase tracking-wider text-slate-500\">Pecahan mengikut projek</p>
              <div className=\"mt-2 divide-y divide-slate-100\">{workerProjectPaymentBreakdown.map((summary) => <div key={summary.project.id} className=\"py-3\">
                <div className=\"flex items-start justify-between gap-3\">
                  <div className=\"min-w-0\">
                    <p className=\"truncate text-sm font-black text-slate-900\">{projectOptionLabel(summary.project)}</p>
                    <p className=\"mt-1 text-xs text-slate-500\">{formatDays(summary.workDays)} · Hutang {formatMoney(summary.outstanding)}</p>
                  </div>
                  <div className=\"shrink-0 text-right\">
                    <strong className=\"text-sm text-sky-700\">{formatMoney(summary.cash)}</strong>
                    <p className=\"text-[10px] text-slate-400\">Tunai dari amaun</p>
                  </div>
                </div>
                {summary.advanceDeduction > 0 && <p className=\"mt-1 text-xs text-amber-700\">+ Pinjaman ditolak {formatMoney(summary.advanceDeduction)}</p>}
                {summary.balance > 0 && <p className=\"mt-1 text-xs font-bold text-rose-600\">Baki selepas bayaran {formatMoney(summary.balance)}</p>}
              </div>)}</div>
              <p className=\"mt-2 text-[11px] text-slate-500\">Bayar satu amaun sahaja. Sistem agih automatik bermula daripada projek yang mempunyai baki paling lama.</p>
            </div>}
          </>
          : <label>
            <span className=\"field-label\">Upah kontrak untuk bayaran ini</span>
            <input type=\"number\" min=\"0.01\" step=\"0.01\" required className=\"field-control\" value={grossInput} onChange={(event) => setGrossInput(event.target.value)} />
          </label>}"""
replace_once(old_daily_summary, new_daily_summary, 'daily total and project breakdown')

old_advance_decls = """            const selected = selectedAdvances.includes(advance.id)
            const exceedsPayment = !selected && roundMoney(deduction + advance.amount) > availableForPayment
            return <label key={advance.id} className={`flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm ${exceedsPayment ? 'opacity-45' : ''}`}>"""
new_advance_decls = """            const selected = selectedAdvances.includes(advance.id)
            const projectOutstanding = workerProjectPaymentSummaries.find((summary) => summary.project.id === advance.project_id)?.outstanding ?? availableForPayment
            const selectedForProject = selectedAdvanceTotalsByProject.get(advance.project_id) ?? 0
            const exceedsProject = selectedWorker?.pay_type === 'daily' && !selected && roundMoney(selectedForProject + advance.amount) > projectOutstanding
            const exceedsPayment = !selected && roundMoney(deduction + advance.amount) > availableForPayment
            const disabled = exceedsPayment || exceedsProject
            const advanceProject = projects.find((project) => project.id === advance.project_id)
            return <label key={advance.id} className={`flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm ${disabled ? 'opacity-45' : ''}`}>"""
replace_once(old_advance_decls, new_advance_decls, 'advance validation display')
replace_once("disabled={exceedsPayment}", "disabled={disabled}", 'advance disabled state')
replace_once(
    """                {formatDate(advance.advance_date)}
              </span>""",
    """                <span>{formatDate(advance.advance_date)}{selectedWorker?.pay_type === 'daily' && advanceProject && <span className=\"mt-0.5 block text-[10px] text-slate-400\">{projectOptionLabel(advanceProject)}</span>}</span>
              </span>""",
    'advance project label',
)

path.write_text(text)
