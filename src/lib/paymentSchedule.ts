import type { Database } from '../types/database'

export type PaymentSchedule = Database['public']['Tables']['payment_schedules']['Row']
export type PaymentScheduleStage = Database['public']['Tables']['payment_schedule_stages']['Row']
export type PaymentScheduleTemplate = '4' | '5' | '8' | 'manual'

export type PaymentScheduleDraftStage = {
  local_id: string
  label: string
  description: string
  percentage: string
}

export type PaymentScheduleDraft = {
  version: 1
  project_id: number
  title: string
  notes: string
  stages: PaymentScheduleDraftStage[]
  saved_at: string
}

const templates: Record<Exclude<PaymentScheduleTemplate, 'manual'>, Array<Omit<PaymentScheduleDraftStage, 'local_id'>>> = {
  '4': [
    { label: 'Deposit / Mula kerja', description: 'Bayaran permulaan kerja dan mobilisasi tapak.', percentage: '30' },
    { label: 'Kemajuan 1', description: 'Bayaran apabila tahap kemajuan pertama dicapai.', percentage: '30' },
    { label: 'Kemajuan 2', description: 'Bayaran apabila tahap kemajuan kedua dicapai.', percentage: '30' },
    { label: 'Bayaran akhir / Serahan kunci', description: 'Baki akhir apabila kerja siap dan diserahkan.', percentage: '10' },
  ],
  '5': [
    { label: 'Deposit / Mula kerja', description: 'Bayaran untuk memulakan kerja.', percentage: '20' },
    { label: 'Siap roof beam', description: 'Bayaran apabila kerja roof beam siap.', percentage: '20' },
    { label: 'Bumbung, paip, wiring & plaster', description: 'Bayaran selepas kerja utama tahap ini siap.', percentage: '25' },
    { label: 'Siling & mozek', description: 'Bayaran selepas kerja siling dan mozek siap.', percentage: '25' },
    { label: 'Bayaran akhir / Serahan kunci', description: 'Baki akhir apabila kerja siap dan diserahkan.', percentage: '10' },
  ],
  '8': [
    { label: 'Deposit / Mula kerja', description: 'Bayaran permulaan dan mobilisasi.', percentage: '10' },
    { label: 'Footing & ground beam', description: 'Bayaran selepas kerja asas tahap ini siap.', percentage: '15' },
    { label: 'Tiang & dinding', description: 'Bayaran selepas kerja struktur dan dinding tahap ini siap.', percentage: '15' },
    { label: 'Roof beam & rangka bumbung', description: 'Bayaran selepas kerja roof beam dan rangka siap.', percentage: '15' },
    { label: 'Bumbung, paip & wiring', description: 'Bayaran selepas pemasangan utama tahap ini siap.', percentage: '15' },
    { label: 'Plaster, siling & mozek', description: 'Bayaran selepas kemasan basah utama siap.', percentage: '10' },
    { label: 'Cat & pemasangan aksesori', description: 'Bayaran selepas cat dan pemasangan aksesori siap.', percentage: '10' },
    { label: 'Bayaran akhir / Serahan kunci', description: 'Baki akhir apabila kerja siap dan diserahkan.', percentage: '10' },
  ],
}

export function paymentScheduleTemplate(template: PaymentScheduleTemplate): PaymentScheduleDraftStage[] {
  const source = template === 'manual'
    ? [
        { label: 'Tahap 1', description: '', percentage: '50' },
        { label: 'Tahap 2', description: '', percentage: '50' },
      ]
    : templates[template]
  return source.map((stage) => ({ ...stage, local_id: scheduleLocalId() }))
}

export function paymentScheduleTotal(stages: PaymentScheduleDraftStage[]) {
  return Math.round(stages.reduce((total, stage) => total + parsePercentage(stage.percentage), 0) * 1000) / 1000
}

export function paymentScheduleAmount(basisAmount: number, percentage: string) {
  return Math.round(basisAmount * parsePercentage(percentage)) / 100
}

export function paymentScheduleAmounts(basisAmount: number, stages: PaymentScheduleDraftStage[]) {
  let allocated = 0
  return stages.map((stage, index) => {
    const amount = index === stages.length - 1
      ? Math.round((basisAmount - allocated) * 100) / 100
      : paymentScheduleAmount(basisAmount, stage.percentage)
    allocated = Math.round((allocated + amount) * 100) / 100
    return amount
  })
}

export function validatePaymentSchedule(draft: PaymentScheduleDraft) {
  if (!draft.title.trim()) return 'Tajuk jadual pembayaran mesti diisi.'
  if (draft.stages.length < 2 || draft.stages.length > 12) return 'Jadual pembayaran mesti mempunyai 2 hingga 12 tahap.'
  for (const [index, stage] of draft.stages.entries()) {
    if (!stage.label.trim()) return `Nama tahap ${index + 1} mesti diisi.`
    const percentage = parsePercentage(stage.percentage)
    if (percentage <= 0 || percentage > 100) return `Peratus tahap ${index + 1} mesti lebih 0 dan tidak melebihi 100.`
  }
  const total = paymentScheduleTotal(draft.stages)
  if (total !== 100) return `Jumlah peratus mesti tepat 100%. Jumlah semasa ${total.toLocaleString('ms-MY', { maximumFractionDigits: 3 })}%.`
  return null
}

export function paymentScheduleDraftFromRows(schedule: PaymentSchedule, stages: PaymentScheduleStage[]): PaymentScheduleDraft {
  return {
    version: 1,
    project_id: schedule.project_id,
    title: schedule.title,
    notes: schedule.notes,
    stages: stages.slice().sort((a, b) => a.stage_no - b.stage_no).map((stage) => ({
      local_id: `payment-stage-${stage.id}`,
      label: stage.label,
      description: stage.description,
      percentage: String(Number(stage.percentage)),
    })),
    saved_at: schedule.updated_at,
  }
}

export function paymentScheduleDraftKey(ownerUserId: string, projectId: number) {
  return `mrpi:payment-schedule:${ownerUserId}:${projectId}`
}

export function savePaymentScheduleLocal(key: string, draft: PaymentScheduleDraft) {
  localStorage.setItem(key, JSON.stringify({ ...draft, saved_at: new Date().toISOString() }))
}

export function loadPaymentScheduleLocal(key: string): PaymentScheduleDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as PaymentScheduleDraft | null
    if (!value || value.version !== 1 || !Array.isArray(value.stages)) return null
    return value
  } catch {
    return null
  }
}

export function clearPaymentScheduleLocal(key: string) {
  localStorage.removeItem(key)
}

function parsePercentage(value: string) {
  const normalized = value.trim().replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function scheduleLocalId() {
  return `payment-stage-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
