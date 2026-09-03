import {
  Banknote,
  CircleAlert,
  HandCoins,
  Plus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadAdvances, loadAttendance, loadProjects, loadWorkers } from '../lib/queries'
import { supabase } from '../lib/supabase'
import {
  formatDate,
  formatMoney,
  localDateISO,
  monthStart,
  outstandingAttendanceWage,
  payTypeLabel,
  paymentMethods,
} from '../lib/workforce'
import type { Attendance, PaymentMethod, Project, Worker, WorkerAdvance } from '../types/domain'

type WageGroup = {
  worker: Worker
  project: Project
  rows: Attendance[]
  outstanding: number
  start: string
  end: string
}

type WorkerWageSummary = {
  worker: Worker
  groups: WageGroup[]
  workDays: number
  outstanding: number
  advances: number
  netPay: number
}

type WorkerProjectPaymentSummary = {
  project: Project
  rows: Attendance[]
  outstanding: number
  workDays: number
  start: string
  end: string
}

type CrewProjectSummary = {
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
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function workUnits(row: Attendance) {
  if (row.status === 'half_day') return 0.5
  return row.status === 'present' ? 1 : 0
}

function formatDays(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hari`
}

function projectOptionLabel(project: Project) {
  return project.workforce_name ? project.project_no : `${project.project_no} · ${project.project_name}`
}

function deductibleAdvances(rows: WorkerAdvance[], outstanding: number) {
  let total = 0
  const sorted = [...rows].sort((a, b) => a.advance_date.localeCompare(b.advance_date) || a.id - b.id)
  for (const advance of sorted) {
    if (roundMoney(total + advance.amount) > outstanding) break
    total = roundMoney(total + advance.amount)
  }
  return total
}

export function WagePage() {
  const today = localDateISO()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [crewPayOpen, setCrewPayOpen] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [periodStart, setPeriodStart] = useState(monthStart(today))
  const [periodEnd, setPeriodEnd] = useState(today)
  const [crewHeadId, setCrewHeadId] = useState('')
  const [crewPeriodStart, setCrewPeriodStart] = useState(monthStart(today))
  const [crewPeriodEnd, setCrewPeriodEnd] = useState(today)
  const [grossInput, setGrossInput] = useState('')
  const [cashInput, setCashInput] = useState('')
  const [selectedAdvances, setSelectedAdvances] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [loadedWorkers, loadedProjects, loadedAttendance, loadedAdvances] = await Promise.all([
        loadWorkers(true),
        loadProjects(),
        loadAttendance(),
        loadAdvances(true),
      ])
      setWorkers(loadedWorkers)
      setProjects(loadedProjects)
      setAttendance(loadedAttendance)
      setAdvances(loadedAdvances)
      setWorkerId((current) => loadedWorkers.some((worker) => String(worker.id) === current)
        ? current
        : String(loadedWorkers[0]?.id ?? ''))
      setProjectId((current) => loadedProjects.some((project) => String(project.id) === current)
        ? current
        : String(loadedProjects[0]?.id ?? ''))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const workerMap = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers])

  const groups = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    const groupedRows = new Map<string, Attendance[]>()

    for (const row of attendance) {
      if (!row.project_id || row.status === 'absent') continue
      if (outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount) <= 0) continue
      const key = `${row.worker_id}:${row.project_id}`
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row])
    }

    return [...groupedRows.entries()].flatMap(([key, rows]) => {
      const [workerRaw, projectRaw] = key.split(':')
      const worker = workerMap.get(Number(workerRaw))
      const project = projectMap.get(Number(projectRaw))
      if (!worker || !project) return []
      const dates = rows.map((row) => row.attendance_date).sort()
      return [{
        worker,
        project,
        rows,
        outstanding: roundMoney(rows.reduce(
          (sum, row) => sum + outstandingAttendanceWage(row.wage_amount, row.paid_wage_amount),
          0,
        )),
        start: dates[0]!,
        end: dates.at(-1)!,
      }]
    })
  }, [attendance, projects, workerMap])

  const workerSummaries = useMemo(() => workers.flatMap((worker) => {
    const workerGroups = groups.filter((group) => group.worker.id === worker.id)
    if (!workerGroups.length) return []
    const rows = workerGroups.flatMap((group) => group.rows)
    const outstanding = roundMoney(workerGroups.reduce((sum, group) => sum + group.outstanding, 0))
    const openAdvances = roundMoney(advances
      .filter((advance) => advance.worker_id === worker.id && (advance.advance_scope ?? 'worker') === 'worker')
      .reduce((sum, advance) => sum + advance.amount, 0))
    return [{
      worker,
      groups: workerGroups,
      workDays: rows.reduce((sum, row) => sum + workUnits(row), 0),
      outstanding,
      advances: openAdvances,
      netPay: roundMoney(Math.max(0, outstanding - openAdvances)),
    } satisfies WorkerWageSummary]
  }), [advances, groups, workers])

  const crewProjectSummaries = useMemo(() => {
    const summaries: CrewProjectSummary[] = []
    const leaders = workers.filter((worker) => worker.is_crew_leader)
    for (const leader of leaders) {
      const crewIds = new Set([leader.id, ...workers.filter((worker) => worker.crew_leader_id === leader.id).map((worker) => worker.id)])
      const crewGroups = groups.filter((group) => crewIds.has(group.worker.id) && group.worker.pay_type === 'daily')
      const projectIds = [...new Set(crewGroups.map((group) => group.project.id))]
      for (const currentProjectId of projectIds) {
        const projectGroups = crewGroups.filter((group) => group.project.id === currentProjectId)
        const project = projectGroups[0]?.project
        if (!project) continue
        let outstanding = 0
        let advanceTotal = 0
        let workDays = 0
        const dates: string[] = []
        const owingWorkerIds = new Set<number>()
        for (const group of projectGroups) {
          outstanding = roundMoney(outstanding + group.outstanding)
          workDays += group.rows.reduce((sum, row) => sum + workUnits(row), 0)
          dates.push(group.start, group.end)
          owingWorkerIds.add(group.worker.id)
          const workerAdvanceRows = advances.filter((advance) => advance.worker_id === group.worker.id && advance.project_id === project.id && (advance.advance_scope ?? 'worker') === 'worker')
          advanceTotal = roundMoney(advanceTotal + deductibleAdvances(workerAdvanceRows, group.outstanding))
        }
        const groupAdvanceRows = advances.filter((advance) => advance.worker_id === leader.id && advance.project_id === project.id && advance.advance_scope === 'crew')
        const groupAdvances = deductibleAdvances(groupAdvanceRows, Math.max(0, roundMoney(outstanding - advanceTotal)))
        advanceTotal = roundMoney(advanceTotal + groupAdvances)
        dates.sort()
        summaries.push({
          leader,
          project,
          workerCount: owingWorkerIds.size,
          workDays,
          outstanding,
          advances: advanceTotal,
          groupAdvances,
          netPay: roundMoney(Math.max(0, outstanding - advanceTotal)),
          start: dates[0]!,
          end: dates.at(-1)!,
        })
      }
    }
    return summaries.sort((a, b) => a.leader.name.localeCompare(b.leader.name) || a.project.project_no.localeCompare(b.project.project_no))
  }, [advances, groups, workers])

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

  const selectedWorker = workers.find((worker) => worker.id === Number(workerId))

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

  const selectedCrewLeader = workers.find((worker) => worker.id === Number(crewHeadId) && worker.is_crew_leader)
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

  useEffect(() => {
    if (!payOpen || selectedWorker?.pay_type !== 'daily') return
    setCashInput(Math.max(0, roundMoney(outstandingTotal - deduction)).toFixed(2))
  }, [deduction, outstandingTotal, payOpen, selectedWorker?.pay_type])

  let paymentError = ''
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

  const crewPaymentError = !selectedCrewLeader
    ? 'Kepala Tukang tidak sah.'
    : crewPeriodEnd < crewPeriodStart
      ? 'Tempoh bayaran kumpulan tidak sah.'
      : !crewPaymentProjectIds.length
        ? 'Tiada baki upah pekerja kumpulan dalam tempoh ini.'
        : ''

  function resetSelectedAdvances() {
    setSelectedAdvances([])
  }

  function openWorkerPayment(summary: WorkerWageSummary) {
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

  function openCrewPayment(summary: CrewLeaderSummary) {
    setCrewHeadId(String(summary.leader.id))
    setCrewPeriodStart(summary.start)
    setCrewPeriodEnd(summary.end)
    setCrewPayOpen(true)
  }

  function selectWorker(value: string) {
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

  function selectProject(value: string) {
    setProjectId(value)
    const group = groups.find((item) => item.worker.id === Number(workerId) && item.project.id === Number(value))
    if (group) {
      setPeriodStart(group.start)
      setPeriodEnd(group.end)
    }
    resetSelectedAdvances()
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedWorker || paymentError) return
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const paymentResult = selectedWorker.pay_type === 'daily'
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
      if (paymentResult.error) throw paymentResult.error
      setPayOpen(false)
      resetSelectedAdvances()
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function payCrew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || crewPaymentError) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { error: crewPaymentRequestError } = await supabase.rpc('record_worker_crew_wage_payment_all_projects', {
        p_head_worker_id: Number(crewHeadId),
        p_project_ids: crewPaymentProjectIds,
        p_period_start: crewPeriodStart,
        p_period_end: crewPeriodEnd,
        p_payment_date: String(form.get('payment_date')),
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
      })
      if (crewPaymentRequestError) throw crewPaymentRequestError
      setCrewPayOpen(false)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function recordAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { error: advanceError } = await supabase.rpc('record_worker_advance_scoped', {
        p_worker_id: Number(form.get('worker_id')),
        p_project_id: Number(form.get('project_id')),
        p_advance_date: String(form.get('advance_date')),
        p_amount: Number(form.get('amount')),
        p_payment_method: String(form.get('payment_method')),
        p_notes: String(form.get('notes') || ''),
        p_advance_scope: String(form.get('advance_scope') || 'worker'),
      })
      if (advanceError) throw advanceError
      setAdvanceOpen(false)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock label="Mengira baki upah..." />

  return <>
    <PageHeader
      eyebrow="Bayaran pekerja"
      title="Upah & pinjaman"
      description="Ringkas: hari kerja, hutang upah, pinjaman dan jumlah bersih yang perlu dibayar."
      action={<div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setAdvanceOpen(true)}><HandCoins className="h-4 w-4" />Pinjaman</button>
        <button className="btn-primary" onClick={openPayment}><Plus className="h-4 w-4" />Bayar upah</button>
      </div>}
    />

    {error && <div className="mb-5"><ErrorBlock message={error} retry={() => void refresh()} /></div>}

    {advanceOpen && <Modal title="Rekod pinjaman" close={() => setAdvanceOpen(false)}>
      <form onSubmit={recordAdvance} className="space-y-4">
        <WorkerProjectFields workers={workers} projects={projects} />
        <label><span className="field-label">Jenis pinjaman</span><select name="advance_scope" className="field-control" defaultValue="worker"><option value="worker">Pinjaman individu</option><option value="crew">Pinjaman kumpulan · Kepala Tukang</option></select><span className="mt-1 block text-[11px] text-slate-500">Pinjaman kumpulan ditolak daripada jumlah bayaran semua pekerja bawah Kepala Tukang untuk projek ini.</span></label>
        <label><span className="field-label">Tarikh</span><input name="advance_date" type="date" className="field-control" required defaultValue={today} /></label>
        <label><span className="field-label">Amaun</span><input name="amount" type="number" min="0.01" step="0.01" className="field-control" required /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue="cash">{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" /></label>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan pinjaman'}</button>
      </form>
    </Modal>}

    {payOpen && <Modal title="Rekod bayaran upah" close={() => setPayOpen(false)}>
      <form onSubmit={pay} className="space-y-4">
        <label>
          <span className="field-label">Pekerja</span>
          <select className="field-control" value={workerId} onChange={(event) => selectWorker(event.target.value)}>
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {payTypeLabel(worker.pay_type)}</option>)}
          </select>
        </label>
        {selectedWorker?.pay_type === 'contract' && <label>
          <span className="field-label">Projek</span>
          <select className="field-control" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}
          </select>
        </label>}
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">Dari</span><input type="date" className="field-control" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label><span className="field-label">Hingga</span><input type="date" className="field-control" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
        </div>

        {selectedWorker?.pay_type === 'daily'
          ? <>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-sky-700">Hutang upah semua projek dalam tempoh</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(outstandingTotal)}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDays(matchingRows.reduce((sum, row) => sum + workUnits(row), 0))} berbaki · {workerProjectPaymentSummaries.length} projek.</p>
            </div>

            {workerProjectPaymentBreakdown.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Pecahan mengikut projek</p>
              <div className="mt-2 divide-y divide-slate-100">{workerProjectPaymentBreakdown.map((summary) => <div key={summary.project.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{projectOptionLabel(summary.project)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDays(summary.workDays)} · Hutang {formatMoney(summary.outstanding)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="text-sm text-sky-700">{formatMoney(summary.cash)}</strong>
                    <p className="text-[10px] text-slate-400">Tunai dari amaun</p>
                  </div>
                </div>
                {summary.advanceDeduction > 0 && <p className="mt-1 text-xs text-amber-700">+ Pinjaman ditolak {formatMoney(summary.advanceDeduction)}</p>}
                {summary.balance > 0 && <p className="mt-1 text-xs font-bold text-rose-600">Baki selepas bayaran {formatMoney(summary.balance)}</p>}
              </div>)}</div>
              <p className="mt-2 text-[11px] text-slate-500">Bayar satu amaun sahaja. Sistem agih automatik bermula daripada projek yang mempunyai baki paling lama.</p>
            </div>}
          </>
          : <label>
            <span className="field-label">Upah kontrak untuk bayaran ini</span>
            <input type="number" min="0.01" step="0.01" required className="field-control" value={grossInput} onChange={(event) => setGrossInput(event.target.value)} />
          </label>}

        {eligibleAdvances.length > 0 && <fieldset>
          <legend className="field-label">Pinjaman untuk ditolak</legend>
          <div className="space-y-2">{eligibleAdvances.map((advance) => {
            const selected = selectedAdvances.includes(advance.id)
            const projectOutstanding = workerProjectPaymentSummaries.find((summary) => summary.project.id === advance.project_id)?.outstanding ?? availableForPayment
            const selectedForProject = selectedAdvanceTotalsByProject.get(advance.project_id) ?? 0
            const exceedsProject = selectedWorker?.pay_type === 'daily' && !selected && roundMoney(selectedForProject + advance.amount) > projectOutstanding
            const exceedsPayment = !selected && roundMoney(deduction + advance.amount) > availableForPayment
            const disabled = exceedsPayment || exceedsProject
            const advanceProject = projects.find((project) => project.id === advance.project_id)
            return <label key={advance.id} className={`flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm ${disabled ? 'opacity-45' : ''}`}>
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) => setSelectedAdvances((ids) => event.target.checked
                    ? [...ids, advance.id]
                    : ids.filter((id) => id !== advance.id))}
                  className="h-5 w-5 accent-sky-600"
                />
                <span>{formatDate(advance.advance_date)}{selectedWorker?.pay_type === 'daily' && advanceProject && <span className="mt-0.5 block text-[10px] text-slate-400">{projectOptionLabel(advanceProject)}</span>}</span>
              </span>
              <strong>{formatMoney(advance.amount)}</strong>
            </label>
          })}</div>
        </fieldset>}

        {selectedWorker?.pay_type === 'daily' && <label>
          <span className="field-label">Tunai dibayar sekarang</span>
          <input
            type="number"
            min="0"
            max={Math.max(0, outstandingTotal - deduction)}
            step="0.01"
            required
            className="field-control text-lg font-black"
            value={cashInput}
            onChange={(event) => setCashInput(event.target.value)}
          />
          <span className="mt-1 block text-[11px] text-slate-500">Boleh bayar sebahagian. Baki akan kekal sebagai hutang upah.</span>
        </label>}

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex justify-between text-sm"><span>Hutang upah</span><strong>{formatMoney(selectedWorker?.pay_type === 'daily' ? outstandingTotal : contractGross)}</strong></div>
          <div className="mt-2 flex justify-between text-sm text-amber-700"><span>Tolak pinjaman</span><strong>{formatMoney(deduction)}</strong></div>
          <div className="mt-2 flex justify-between text-sm"><span>Tunai dibayar</span><strong className="text-sky-700">{formatMoney(cashAmount)}</strong></div>
          {selectedWorker?.pay_type === 'daily' && <div className="mt-3 flex justify-between border-t border-slate-200 pt-3"><span className="font-black">Baki selepas bayaran</span><strong className={balanceAfterPayment > 0 ? 'text-rose-600' : 'text-emerald-700'}>{formatMoney(balanceAfterPayment)}</strong></div>}
        </div>

        <label><span className="field-label">Tarikh bayar</span><input name="payment_date" type="date" className="field-control" required defaultValue={today} /></label>
        <label><span className="field-label">Kaedah</span><select name="payment_method" className="field-control" defaultValue={'cash' satisfies PaymentMethod}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label><span className="field-label">Catatan</span><textarea name="notes" className="field-control" /></label>

        {paymentError && <p className="alert-error flex gap-2"><CircleAlert className="h-5 w-5 shrink-0" />{paymentError}</p>}
        <button className="btn-primary w-full" disabled={saving || Boolean(paymentError)}>{saving ? 'Merekod...' : balanceAfterPayment > 0 ? 'Sahkan bayaran separa' : 'Sahkan bayaran upah'}</button>
      </form>
    </Modal>}

    {crewPayOpen && selectedCrewLeader && <Modal title={`Bayar kumpulan · ${selectedCrewLeader.name}`} close={() => setCrewPayOpen(false)}>
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

    <div className="space-y-3">
      {workerSummaries.map((summary) => {
        const leader = summary.worker.crew_leader_id ? workerMap.get(summary.worker.crew_leader_id) : undefined
        return <article key={summary.worker.id} className="card p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-black">{summary.worker.name}</h2>
              {leader && <p className="mt-1 text-xs font-bold text-violet-700">Gaji biasanya melalui {leader.name}</p>}
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-4 xl:max-w-3xl">
              <SimpleMetric label="Tempoh kerja" value={formatDays(summary.workDays)} />
              <SimpleMetric label="Hutang upah" value={formatMoney(summary.outstanding)} />
              <SimpleMetric label="Pinjaman" value={formatMoney(summary.advances)} tone="amber" />
              <SimpleMetric label="Bersih" value={formatMoney(summary.netPay)} tone="sky" strong />
            </div>
            <button onClick={() => openWorkerPayment(summary)} className="btn-primary shrink-0"><Banknote className="h-4 w-4" />{leader ? 'Bayar terus' : 'Bayar'}</button>
          </div>
        </article>
      })}
      {!workerSummaries.length && <EmptyBlock title="Tiada hutang upah" description="Pekerja kontrak masih boleh dibayar menggunakan butang Bayar upah." />}
    </div>
  </>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-6">
    <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        <button type="button" onClick={close} className="h-10 rounded-xl px-3 text-sm font-black text-slate-500 hover:bg-slate-100">Tutup</button>
      </div>
      {children}
    </div>
  </div>
}

function WorkerProjectFields({ workers, projects }: { workers: Worker[]; projects: Project[] }) {
  return <>
    <label><span className="field-label">Pekerja</span><select name="worker_id" className="field-control" required>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
    <label><span className="field-label">Projek</span><select name="project_id" className="field-control" required>{projects.map((project) => <option key={project.id} value={project.id}>{projectOptionLabel(project)}</option>)}</select></label>
  </>
}

function SimpleMetric({ label, value, tone = 'slate', strong = false }: { label: string; value: string; tone?: 'slate' | 'amber' | 'sky'; strong?: boolean }) {
  const valueClass = tone === 'amber' ? 'text-amber-700' : tone === 'sky' ? 'text-sky-700' : 'text-slate-950'
  return <div className="rounded-xl bg-slate-50 px-3 py-3">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 ${strong ? 'text-xl' : 'text-base'} font-black ${valueClass}`}>{value}</p>
  </div>
}
