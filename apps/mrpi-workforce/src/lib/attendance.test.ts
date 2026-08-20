import { describe, expect, it } from 'vitest'
import type { AttendanceDraft, Project, Worker } from '../types/domain'
import {
  assignWorkersToProject,
  attendanceCounts,
  estimatedDailyLabour,
  groupAttendanceRows,
  setProjectAttendanceStatus,
  type AttendanceRow,
} from './attendance'

const projects: Project[] = [
  { id: 10, company_id: 1, owner_user_id: 'owner', project_no: 'PRJ-10', project_name: 'A', client_name: 'A', status: 'active' },
  { id: 20, company_id: 1, owner_user_id: 'owner', project_no: 'PRJ-20', project_name: 'B', client_name: 'B', status: 'active' },
]

function row(id: number, projectId: number | null = null, paid = false): AttendanceRow {
  const worker: Worker = {
    id,
    company_id: 1,
    owner_user_id: 'owner',
    name: `Worker ${id}`,
    pay_type: 'daily',
    default_daily_rate: 100,
    notes: '',
    is_active: true,
    created_at: '',
    updated_at: '',
  }
  const draft: AttendanceDraft = {
    worker_id: id,
    project_id: projectId,
    status: null,
    daily_rate_snapshot: 100,
    overtime_hours: 0,
    overtime_rate: 0,
    notes: '',
    existing_id: null,
    paid,
  }
  return { worker, draft }
}

describe('attendance grouping', () => {
  it('groups workers by their own project and keeps unassigned workers separate', () => {
    const groups = groupAttendanceRows([row(1, 20), row(2), row(3, 10)], projects)
    expect(groups.map((group) => [group.project?.id ?? null, group.rows.map((item) => item.worker.id)])).toEqual([
      [10, [3]],
      [20, [1]],
      [null, [2]],
    ])
  })

  it('assigns selected editable workers without moving paid attendance', () => {
    const result = assignWorkersToProject([row(1), row(2, 10, true)], [1, 2], 20)
    expect(result.map((item) => item.draft.project_id)).toEqual([20, 10])
  })

  it('marks every editable worker in one project present', () => {
    const result = setProjectAttendanceStatus([row(1, 10), row(2, 10, true), row(3, 20)], 10, 'present')
    expect(result.map((item) => item.draft.status)).toEqual(['present', null, null])
  })

  it('counts statuses and totals daily labour by attendance units', () => {
    const first = row(1, 10)
    first.draft.status = 'present'
    const second = row(2, 10)
    second.draft.status = 'half_day'
    expect(attendanceCounts([first, second])).toEqual({ present: 1, half: 1, absent: 0, pending: 0 })
    expect(estimatedDailyLabour([first, second])).toBe(150)
  })
})
