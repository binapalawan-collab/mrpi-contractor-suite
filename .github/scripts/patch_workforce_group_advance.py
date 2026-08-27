from pathlib import Path


def rep(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit("Missing patch target: " + label)
    return text.replace(old, new, count)


p = Path("apps/mrpi-workforce/src/types/domain.ts")
s = p.read_text()
s = rep(s, "export type WorkerAdvance={id:number;worker_id:number;project_id:number;advance_date:string;amount:number;payment_method:PaymentMethod;notes:string;applied_wage_payment_id:number|null;created_at:string}", "export type WorkerAdvance={id:number;worker_id:number;project_id:number;advance_date:string;amount:number;payment_method:PaymentMethod;notes:string;advance_scope?:'worker'|'crew';applied_wage_payment_id:number|null;applied_wage_batch_id?:number|null;created_at:string}", "WorkerAdvance")
s = rep(s, "export type WagePayment={id:number;worker_id:number;project_id:number;period_start:string;period_end:string;payment_date:string;gross_amount:number;advance_deduction:number;net_amount:number;payment_method:PaymentMethod;notes:string;recipient_worker_id?:number|null;wage_batch_id?:number|null;created_at:string}", "export type WagePayment={id:number;worker_id:number;project_id:number;period_start:string;period_end:string;payment_date:string;gross_amount:number;advance_deduction:number;crew_advance_deduction?:number;net_amount:number;payment_method:PaymentMethod;notes:string;recipient_worker_id?:number|null;wage_batch_id?:number|null;created_at:string}", "WagePayment")
s = rep(s, "export type WagePaymentBatch={id:number;head_worker_id:number;project_id:number;company_id:number;owner_user_id:string;period_start:string;period_end:string;payment_date:string;payment_method:PaymentMethod;total_gross:number;total_advance_deduction:number;total_net_amount:number;notes:string;created_at:string}", "export type WagePaymentBatch={id:number;head_worker_id:number;project_id:number;company_id:number;owner_user_id:string;period_start:string;period_end:string;payment_date:string;payment_method:PaymentMethod;total_gross:number;total_advance_deduction:number;group_advance_deduction?:number;total_net_amount:number;notes:string;created_at:string}", "WagePaymentBatch")
p.write_text(s)

p = Path("apps/mrpi-workforce/src/lib/queries.ts")
s = p.read_text()
s = rep(s, "if(unappliedOnly)query=query.is('applied_wage_payment_id',null);", "if(unappliedOnly)query=query.is('applied_wage_payment_id',null).is('applied_wage_batch_id',null);", "loadAdvances filter")
s = rep(s, "export async function loadWorkerAdvances(workerId:number,fromDate?:string,toDate?:string){let query=configured().from('worker_advances').select('*').eq('worker_id',workerId).order", "export async function loadWorkerAdvances(workerId:number,fromDate?:string,toDate?:string){let query=configured().from('worker_advances').select('*').eq('worker_id',workerId).eq('advance_scope','worker').order", "worker report personal advances")
s = rep(s, "advance_deduction:Number(row.advance_deduction),net_amount:Number(row.net_amount)", "advance_deduction:Number(row.advance_deduction),crew_advance_deduction:Number(row.crew_advance_deduction??0),net_amount:Number(row.net_amount)", "normalize wage crew deduction")
p.write_text(s)

p = Path("apps/mrpi-workforce/src/pages/WagePage.tsx")
s = p.read_text()
s = rep(s, "  advances: number\n  netPay: number\n  start: string", "  advances: number\n  groupAdvances: number\n  netPay: number\n  start: string", "CrewProjectSummary")
s = rep(s, ".filter((advance) => advance.worker_id === worker.id)\n      .reduce((sum, advance) => sum + advance.amount, 0))", ".filter((advance) => advance.worker_id === worker.id && (advance.advance_scope ?? 'worker') === 'worker')\n      .reduce((sum, advance) => sum + advance.amount, 0))", "worker personal advances")
s = s.replace("const workerAdvanceRows = advances.filter((advance) => advance.worker_id === group.worker.id && advance.project_id === project.id)", "const workerAdvanceRows = advances.filter((advance) => advance.worker_id === group.worker.id && advance.project_id === project.id && (advance.advance_scope ?? 'worker') === 'worker')")
s = rep(s, "        dates.sort()\n        summaries.push({\n          leader,\n          project,\n          workerCount: owingWorkerIds.size,\n          workDays,\n          outstanding,\n          advances: advanceTotal,\n          netPay: roundMoney(Math.max(0, outstanding - advanceTotal)),", "        const groupAdvanceRows = advances.filter((advance) => advance.worker_id === leader.id && advance.project_id === project.id && advance.advance_scope === 'crew')\n        const groupAdvances = deductibleAdvances(groupAdvanceRows, Math.max(0, roundMoney(outstanding - advanceTotal)))\n        advanceTotal = roundMoney(advanceTotal + groupAdvances)\n        dates.sort()\n        summaries.push({\n          leader,\n          project,\n          workerCount: owingWorkerIds.size,\n          workDays,\n          outstanding,\n          advances: advanceTotal,\n          groupAdvances,\n          netPay: roundMoney(Math.max(0, outstanding - advanceTotal)),", "crew project group advance")
s = rep(s, "advance.worker_id === Number(workerId) && advance.project_id === Number(projectId)", "advance.worker_id === Number(workerId) && advance.project_id === Number(projectId) && (advance.advance_scope ?? 'worker') === 'worker'", "individual eligible advances")
s = s.replace("const workerAdvanceRows = advances.filter((advance) => advance.worker_id === worker.id && advance.project_id === selectedCrewProject.id)", "const workerAdvanceRows = advances.filter((advance) => advance.worker_id === worker.id && advance.project_id === selectedCrewProject.id && (advance.advance_scope ?? 'worker') === 'worker')")
old_totals = """  const crewTotals = useMemo(() => crewPaymentRows.reduce((totals, row) => ({
    outstanding: roundMoney(totals.outstanding + row.outstanding),
    advances: roundMoney(totals.advances + row.advances),
    cash: roundMoney(totals.cash + row.cash),
  }), { outstanding: 0, advances: 0, cash: 0 }), [crewPaymentRows])"""
new_totals = """  const crewBaseTotals = useMemo(() => crewPaymentRows.reduce((totals, row) => ({
    outstanding: roundMoney(totals.outstanding + row.outstanding),
    advances: roundMoney(totals.advances + row.advances),
  }), { outstanding: 0, advances: 0 }), [crewPaymentRows])
  const crewGroupAdvances = useMemo(() => {
    if (!selectedCrewLeader || !selectedCrewProject) return 0
    const groupAdvanceRows = advances.filter((advance) => (
      advance.worker_id === selectedCrewLeader.id
      && advance.project_id === selectedCrewProject.id
      && advance.advance_scope === 'crew'
    ))
    return deductibleAdvances(groupAdvanceRows, Math.max(0, roundMoney(crewBaseTotals.outstanding - crewBaseTotals.advances)))
  }, [advances, crewBaseTotals.advances, crewBaseTotals.outstanding, selectedCrewLeader, selectedCrewProject])
  const crewTotals = useMemo(() => {
    const advancesTotal = roundMoney(crewBaseTotals.advances + crewGroupAdvances)
    return {
      outstanding: crewBaseTotals.outstanding,
      personalAdvances: crewBaseTotals.advances,
      groupAdvances: crewGroupAdvances,
      advances: advancesTotal,
      cash: roundMoney(Math.max(0, crewBaseTotals.outstanding - advancesTotal)),
    }
  }, [crewBaseTotals, crewGroupAdvances])"""
s = rep(s, old_totals, new_totals, "crew totals")
s = rep(s, "supabase.rpc('record_worker_advance', {", "supabase.rpc('record_worker_advance_scoped', {", "advance RPC")
s = rep(s, "        p_notes: String(form.get('notes') || ''),\n      })\n      if (advanceError) throw advanceError", "        p_notes: String(form.get('notes') || ''),\n        p_advance_scope: String(form.get('advance_scope') || 'worker'),\n      })\n      if (advanceError) throw advanceError", "advance scope param")
s = rep(s, '        <WorkerProjectFields workers={workers} projects={projects} />\n        <label><span className="field-label">Tarikh</span>', '        <WorkerProjectFields workers={workers} projects={projects} />\n        <label><span className="field-label">Jenis pinjaman</span><select name="advance_scope" className="field-control" defaultValue="worker"><option value="worker">Pinjaman individu</option><option value="crew">Pinjaman kumpulan · Kepala Tukang</option></select><span className="mt-1 block text-[11px] text-slate-500">Pinjaman kumpulan ditolak daripada jumlah bayaran semua pekerja bawah Kepala Tukang untuk projek ini.</span></label>\n        <label><span className="field-label">Tarikh</span>', "advance type field")
s = rep(s, '          <div className="mt-2 flex justify-between text-sm text-amber-300"><span>Tolak pinjaman</span><strong>{formatMoney(crewTotals.advances)}</strong></div>', '          <div className="mt-2 flex justify-between text-sm text-amber-200"><span>Tolak pinjaman pekerja</span><strong>{formatMoney(crewTotals.personalAdvances)}</strong></div>\n          <div className="mt-2 flex justify-between text-sm text-amber-300"><span>Tolak pinjaman kumpulan</span><strong>{formatMoney(crewTotals.groupAdvances)}</strong></div>', "crew modal totals")
s = rep(s, '            <SimpleMetric label="Pinjaman" value={formatMoney(summary.advances)} tone="amber" />', '            <SimpleMetric label={summary.groupAdvances > 0 ? "Pinjaman · termasuk group" : "Pinjaman"} value={formatMoney(summary.advances)} tone="amber" />', "crew card loan label")
p.write_text(s)
