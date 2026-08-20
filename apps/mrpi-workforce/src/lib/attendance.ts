import type { AttendanceDraft, AttendanceStatus, Project, Worker } from '../types/domain'
import { calculateDailyWage } from './workforce'

export type AttendanceRow = {
  worker: Worker
  draft: AttendanceDraft
}

export type AttendanceGroup = {
  key: string
  project: Project | null
  rows: AttendanceRow[]
}

export function groupAttendanceRows(rows: AttendanceRow[], projects: Project[]) {
  const rowsByProject = new Map<number, AttendanceRow[]>()
  const knownProjectIds = new Set(projects.map((project) => project.id))
  const unassigned: AttendanceRow[] = []

  for (const row of rows) {
    const projectId = row.draft.project_id
    if (!projectId || !knownProjectIds.has(projectId)) {
      unassigned.push(row)
      continue
    }
    rowsByProject.set(projectId, [...(rowsByProject.get(projectId) ?? []), row])
  }

  const groups: AttendanceGroup[] = projects.flatMap((project) => {
    const projectRows = rowsByProject.get(project.id)
    return projectRows?.length
      ? [{ key: `project:${project.id}`, project, rows: projectRows }]
      : []
  })

  if (unassigned.length) {
    groups.push({ key: 'unassigned', project: null, rows: unassigned })
  }

  return groups
}

export function assignWorkersToProject(
  rows: AttendanceRow[],
  workerIds: number[],
  projectId: number | null,
  pendingStatus: AttendanceStatus | null = null,
) {
  const selected = new Set(workerIds)
  return rows.map((row) => {
    if (!selected.has(row.worker.id) || row.draft.paid) return row

    const status = pendingStatus
      ?? (projectId === null && row.draft.status !== 'absent' ? null : row.draft.status)

    return {
      ...row,
      draft: {
        ...row.draft,
        project_id: projectId,
        status,
      },
    }
  })
}

export function setProjectAttendanceStatus(
  rows: AttendanceRow[],
  projectId: number,
  status: AttendanceStatus,
) {
  return rows.map((row) => {
    if (row.draft.project_id !== projectId || row.draft.paid) return row
    return {
      ...row,
      draft: {
        ...row.draft,
        status,
      },
    }
  })
}

export function attendanceCounts(rows: AttendanceRow[]) {
  return {
    present: rows.filter((row) => row.draft.status === 'present').length,
    half: rows.filter((row) => row.draft.status === 'half_day').length,
    absent: rows.filter((row) => row.draft.status === 'absent').length,
    pending: rows.filter((row) => row.draft.status === null).length,
  }
}

export function estimatedDailyLabour(rows: AttendanceRow[]) {
  return rows.reduce((total, row) => {
    if (row.worker.pay_type !== 'daily' || !row.draft.status) return total
    return total + calculateDailyWage(
      row.draft.status,
      row.draft.daily_rate_snapshot,
      row.draft.overtime_hours,
      row.draft.overtime_rate,
    )
  }, 0)
}
