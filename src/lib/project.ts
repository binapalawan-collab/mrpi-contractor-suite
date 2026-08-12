import type { Database } from '../types/database'

export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectSection = Database['public']['Tables']['project_sections']['Row']
export type ProjectItem = Database['public']['Tables']['project_items']['Row']
export type ProjectScopeCorrection = Database['public']['Tables']['project_scope_corrections']['Row']

export type ProjectStatus =
  | 'preparation'
  | 'scheduled'
  | 'active'
  | 'work_completed'
  | 'handed_over'

const statusLabels: Record<ProjectStatus, string> = {
  preparation: 'Persediaan',
  scheduled: 'Dijadualkan',
  active: 'Aktif',
  work_completed: 'Siap Kerja',
  handed_over: 'Diserahkan',
}

const nextStatuses: Record<ProjectStatus, ProjectStatus | null> = {
  preparation: 'scheduled',
  scheduled: 'active',
  active: 'work_completed',
  work_completed: 'handed_over',
  handed_over: null,
}

const actionLabels: Record<ProjectStatus, string | null> = {
  preparation: 'Jadualkan Projek',
  scheduled: 'Mula Projek',
  active: 'Tandakan Siap Kerja',
  work_completed: 'Tandakan Diserahkan',
  handed_over: null,
}

export function isProjectStatus(value: string): value is ProjectStatus {
  return value in statusLabels
}

export function projectStatusLabel(status: string) {
  return isProjectStatus(status) ? statusLabels[status] : status
}

export function projectStatusTone(status: string) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800'
  if (status === 'work_completed' || status === 'handed_over') return 'bg-slate-200 text-slate-800'
  if (status === 'scheduled') return 'bg-blue-100 text-blue-800'
  return 'bg-amber-100 text-amber-800'
}

export function nextProjectStatus(status: string): ProjectStatus | null {
  return isProjectStatus(status) ? nextStatuses[status] : null
}

export function projectStatusActionLabel(status: string) {
  return isProjectStatus(status) ? actionLabels[status] : null
}

export function formatProjectDate(value: string | null) {
  if (!value) return 'Belum ditetapkan'
  const dateOnly = value.slice(0, 10)
  const [year = 1970, month = 1, day = 1] = dateOnly.split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function projectAddress(project: Pick<Project, 'address_line_1' | 'address_line_2' | 'postcode' | 'city' | 'state'>) {
  return [
    project.address_line_1,
    project.address_line_2,
    [project.postcode, project.city].filter(Boolean).join(' '),
    project.state,
  ].filter(Boolean).join(', ')
}

export function effectiveRateForLockedAmount(amount: number, quantity: number) {
  if (!Number.isFinite(amount) || !Number.isFinite(quantity) || quantity <= 0) return null
  return Math.round((amount / quantity) * 1_000_000) / 1_000_000
}

export function calculationMethodLabel(method: string) {
  if (method === 'area') return 'Keluasan'
  if (method === 'length') return 'Panjang'
  if (method === 'qty') return 'Kuantiti'
  if (method === 'lsum') return 'Lump Sum'
  return method
}
