import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attendance, Project, Worker, WorkerAdvance } from '../types/domain'
import { WagePage } from './WagePage'

const mocks = vi.hoisted(() => ({
  loadWorkers: vi.fn(),
  loadProjects: vi.fn(),
  loadAttendance: vi.fn(),
  loadAdvances: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../lib/queries', () => mocks)
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

function worker(id: number, name: string, isActive = true): Worker {
  return {
    id, name, company_id: 1, owner_user_id: 'test-owner', pay_type: 'daily',
    default_daily_rate: 100, notes: '', is_active: isActive,
    is_crew_leader: id === 1, crew_leader_id: id === 1 ? null : 1,
    created_at: '', updated_at: '',
  }
}

function project(id: number, name: string): Project {
  return {
    id, company_id: 1, owner_user_id: 'test-owner', project_no: name,
    project_name: name, client_name: 'Test client', status: 'active', workforce_name: name,
  }
}

function attendance(id: number, workerId: number, projectId: number, wage: number, paid = 0): Attendance {
  return {
    id, worker_id: workerId, project_id: projectId, company_id: 1,
    owner_user_id: 'test-owner', attendance_date: '2026-09-02', status: 'present',
    pay_type_snapshot: 'daily', daily_rate_snapshot: wage, overtime_hours: 0,
    overtime_rate: 0, wage_amount: wage, paid_wage_amount: paid,
    wage_payment_id: null, notes: '', created_at: '', updated_at: '',
  }
}

function advance(id: number, workerId: number, amount: number, scope: 'crew' | 'worker'): WorkerAdvance {
  return {
    id, worker_id: workerId, project_id: 101, advance_date: `2026-09-0${id}`,
    amount, payment_method: 'bank_transfer', notes: '', advance_scope: scope,
    applied_wage_payment_id: null, applied_wage_batch_id: null, created_at: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const workers = [worker(1, 'Ketua'), worker(2, 'Ahli aktif'), worker(3, 'Bekas ahli', false), worker(4, 'Ahli selesai', false)]
  // Respect the real query's active-only option so the regression fails if payroll filters it.
  mocks.loadWorkers.mockImplementation(async (activeOnly = false) => workers.filter((item) => !activeOnly || item.is_active))
  mocks.loadProjects.mockResolvedValue([project(101, 'Tapak A'), project(102, 'Tapak B')])
  mocks.loadAttendance.mockResolvedValue([
    attendance(1, 1, 101, 900), attendance(2, 2, 101, 100),
    attendance(3, 3, 101, 200, 100), attendance(4, 1, 102, 150),
    attendance(5, 4, 101, 70, 70),
  ])
  // The newest crew advance only fits once the inactive member's unpaid wage is included.
  mocks.loadAdvances.mockResolvedValue([
    advance(2, 1, 400, 'crew'), advance(1, 1, 600, 'crew'), advance(3, 2, 50, 'worker'),
  ])
  mocks.rpc.mockResolvedValue({ error: null, data: 2 })
})

afterEach(cleanup)

describe('wage balances for inactive crew members', () => {
  it('includes their unpaid wages and all eligible crew advances in the group balance', async () => {
    render(<WagePage />)
    const heading = await screen.findByRole('heading', { name: 'Ketua', level: 3 })
    const crew = within(heading.closest('article')!)
    expect(crew.getByText('3 orang')).toBeInTheDocument()
    expect(crew.getByText('RM 1,250.00')).toBeInTheDocument()
    expect(crew.getByText('RM 1,050.00')).toBeInTheDocument()
    expect(crew.getByText('RM 200.00')).toBeInTheDocument()

    const formerMember = screen.getByRole('heading', { name: 'Bekas ahli', level: 2 })
    expect(within(formerMember.closest('article')!).getByText('Tidak aktif · masih berbaki')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ahli selesai' })).not.toBeInTheDocument()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('uses the same balance and inactive member in the all-project payment preview', async () => {
    render(<WagePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Bayar kumpulan' }))
    const heading = screen.getByRole('heading', { name: 'Bayar kumpulan · Ketua' })
    const modal = within(heading.parentElement!.parentElement!)
    expect(modal.getByText('Bekas ahli')).toBeInTheDocument()
    expect(modal.getByText('RM 1,000.00')).toBeInTheDocument()
    const confirm = modal.getByRole('button', { name: 'Sahkan bayaran semua projek RM 200.00' })
    expect(confirm).toBeEnabled()
    expect(mocks.rpc).not.toHaveBeenCalled()

    fireEvent.submit(confirm.closest('form')!)
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      'record_worker_crew_wage_payment_all_projects',
      expect.objectContaining({
        p_head_worker_id: 1, p_project_ids: [101, 102],
        p_period_start: '2026-09-02', p_period_end: '2026-09-02',
      }),
    ))
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps new advance entry limited to active workers', async () => {
    render(<WagePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pinjaman' }))
    const selector = screen.getByLabelText('Pekerja')
    expect(within(selector).getByRole('option', { name: 'Ahli aktif' })).toBeInTheDocument()
    expect(within(selector).queryByRole('option', { name: 'Bekas ahli' })).not.toBeInTheDocument()
    expect(within(selector).queryByRole('option', { name: 'Ahli selesai' })).not.toBeInTheDocument()
  })
})
