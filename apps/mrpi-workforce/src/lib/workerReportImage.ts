import type { ReportCalendarMonth } from './reportCalendar'
import type { Attendance, Company, Project, WagePayment, Worker, WorkerAdvance } from '../types/domain'

type WorkerReportImageInput = {
  company: Company | null
  worker: Worker
  month: ReportCalendarMonth
  attendance: Attendance[]
  advances: WorkerAdvance[]
  payments: WagePayment[]
  projects: Project[]
}

type PillStyle = {
  background: string
  foreground: string
}

const WIDTH = 1920
const HEIGHT = 1080
const monthNames = ['januari', 'februari', 'mac', 'april', 'mei', 'jun', 'julai', 'ogos', 'september', 'oktober', 'november', 'disember']
const dayNames = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU', 'AHAD']

export async function generateWorkerReportImage(input: WorkerReportImageInput) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak menyokong penjanaan image.')

  const attendanceMap = new Map(input.attendance.map((record) => [record.attendance_date, record]))
  const projectMap = new Map(input.projects.map((project) => [project.id, project]))
  const paymentMap = groupTransactions(input.payments, (payment) => payment.payment_date, (payment) => payment.net_amount)
  const advanceMap = groupTransactions(input.advances, (advance) => advance.advance_date, (advance) => advance.amount)

  const earned = roundMoney(input.attendance.reduce((sum, record) => sum + Math.max(0, record.wage_amount), 0))
  const covered = roundMoney(input.attendance.reduce((sum, record) => sum + Math.max(0, record.paid_wage_amount), 0))
  const received = roundMoney(input.payments.reduce((sum, payment) => sum + Math.max(0, payment.net_amount), 0))
  const borrowed = roundMoney(input.advances.reduce((sum, advance) => sum + Math.max(0, advance.amount), 0))
  const fullDays = input.attendance.filter((record) => record.status === 'present').length
  const halfDays = input.attendance.filter((record) => record.status === 'half_day').length
  const absentDays = input.attendance.filter((record) => record.status === 'absent').length
  const payableDays = fullDays + halfDays * 0.5
  const fullCover = input.attendance.filter(isFullyCovered).length
  const partialCover = input.attendance.filter(isPartiallyCovered).length

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  drawHeader(ctx, input, payableDays, earned)

  const calendarX = 44
  const calendarY = 184
  const calendarWidth = 1390
  const sidebarX = 1460
  const sidebarWidth = WIDTH - sidebarX - 44
  const weekdayHeight = 44
  const calendarBottom = 1036
  const rowCount = Math.max(5, Math.ceil(input.month.dates.length / 7))
  const cellWidth = calendarWidth / 7
  const cellHeight = (calendarBottom - calendarY - weekdayHeight) / rowCount

  roundedRect(ctx, calendarX, calendarY, calendarWidth, calendarBottom - calendarY, 24)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.stroke()

  dayNames.forEach((day, index) => {
    const x = calendarX + index * cellWidth
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(x, calendarY, cellWidth, weekdayHeight)
    setFont(ctx, 18, 800)
    ctx.fillStyle = '#475569'
    centerText(ctx, day, x + cellWidth / 2, calendarY + 28)
  })

  input.month.dates.forEach((date, index) => {
    const col = index % 7
    const row = Math.floor(index / 7)
    const x = calendarX + col * cellWidth
    const y = calendarY + weekdayHeight + row * cellHeight
    drawCalendarCell(ctx, {
      x,
      y,
      width: cellWidth,
      height: cellHeight,
      date,
      attendance: date ? attendanceMap.get(date) : undefined,
      payment: date ? paymentMap.get(date) ?? 0 : 0,
      advance: date ? advanceMap.get(date) ?? 0 : 0,
      projectMap,
    })
  })

  drawSidebar(ctx, sidebarX, calendarY, sidebarWidth, {
    payableDays,
    fullDays,
    halfDays,
    absentDays,
    earned,
    covered,
    received,
    borrowed,
    fullCover,
    partialCover,
  })

  setFont(ctx, 14, 600)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'right'
  ctx.fillText('MRPI Workforce · PNG 16:9 · tanpa elemen UI', WIDTH - 44, HEIGHT - 18)
  ctx.textAlign = 'left'

  const blob = await canvasToBlob(canvas)
  const fileName = workerReportImageFileName(input.worker.name, input.month.key)
  downloadBlob(blob, fileName)
  return { blob, fileName }
}

export function workerReportImageFileName(workerName: string, monthKey: string) {
  const [year = '', month = '1'] = monthKey.split('-')
  const monthIndex = Math.max(0, Math.min(11, Number(month) - 1))
  return `${slug(workerName) || 'pekerja'}-${monthNames[monthIndex]}-${year}.png`
}

function drawHeader(ctx: CanvasRenderingContext2D, input: WorkerReportImageInput, payableDays: number, earned: number) {
  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, WIDTH, 152)

  setFont(ctx, 18, 800)
  ctx.fillStyle = '#7dd3fc'
  ctx.fillText((input.company?.trading_name || input.company?.legal_name || 'MRPI Resources').toUpperCase(), 48, 42)

  setFont(ctx, 48, 900)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(input.worker.name, 48, 96)

  setFont(ctx, 24, 800)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(capitalize(input.month.label), 48, 130)

  const cards = [
    { label: 'KEHADIRAN', value: `${formatUnits(payableDays)} hari` },
    { label: 'UPAH TERHASIL', value: money(earned) },
  ]
  cards.forEach((card, index) => {
    const x = 1310 + index * 275
    roundedRect(ctx, x, 30, 250, 92, 18)
    ctx.fillStyle = '#0f172a'
    ctx.fill()
    ctx.strokeStyle = '#334155'
    ctx.stroke()
    setFont(ctx, 13, 800)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(card.label, x + 20, 57)
    setFont(ctx, 25, 900)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(card.value, x + 20, 94)
  })
}

function drawCalendarCell(ctx: CanvasRenderingContext2D, input: {
  x: number
  y: number
  width: number
  height: number
  date: string | null
  attendance?: Attendance
  payment: number
  advance: number
  projectMap: Map<number, Project>
}) {
  const { x, y, width, height, date, attendance, payment, advance, projectMap } = input
  ctx.fillStyle = date ? '#ffffff' : '#f8fafc'
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, width, height)
  if (!date) return

  const statusStyle = attendanceStatusStyle(attendance?.status)
  if (attendance) {
    ctx.fillStyle = statusStyle.tint
    ctx.fillRect(x + 2, y + 2, 8, height - 4)
  }

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#0f172a'
  ctx.fillText(String(Number(date.slice(-2))), x + 16, y + 32)

  let cursorY = y + 43
  if (attendance) {
    const statusLabel = attendance.status === 'present' ? 'PENUH' : attendance.status === 'half_day' ? '1/2 HARI' : 'TIDAK HADIR'
    drawPill(ctx, x + 16, cursorY, statusLabel, statusStyle.pill, Math.min(width - 32, 122), 27, 14)
    cursorY += 33

    if (attendance.project_id) {
      const project = projectMap.get(attendance.project_id)
      const projectLabel = project?.workforce_name || project?.source_project_no || project?.project_no || ''
      if (projectLabel) {
        setFont(ctx, 13, 800)
        ctx.fillStyle = '#64748b'
        fitText(ctx, projectLabel, x + 16, cursorY + 15, width - 32)
        cursorY += 23
      }
    }

    if (attendance.overtime_hours > 0) {
      setFont(ctx, 13, 800)
      ctx.fillStyle = '#475569'
      ctx.fillText(`OT ${formatUnits(attendance.overtime_hours)}j`, x + 16, cursorY + 14)
      cursorY += 20
    }

    if (isFullyCovered(attendance)) {
      drawPill(ctx, x + 16, cursorY, 'UPAH PENUH', { background: '#7c3aed', foreground: '#ffffff' }, Math.min(width - 32, 137), 25, 12)
    } else if (isPartiallyCovered(attendance)) {
      drawPill(ctx, x + 16, cursorY, 'UPAH SEPARA', { background: '#f97316', foreground: '#ffffff' }, Math.min(width - 32, 143), 25, 12)
    }
  }

  const transactionY = y + height - 32
  if (payment > 0 && advance > 0) {
    drawPill(ctx, x + 12, transactionY, `BAYAR ${compactMoney(payment)}`, { background: '#0284c7', foreground: '#ffffff' }, width * 0.52 - 16, 23, 11)
    drawPill(ctx, x + width * 0.52, transactionY, `PINJAM ${compactMoney(advance)}`, { background: '#d97706', foreground: '#ffffff' }, width * 0.48 - 12, 23, 11)
  } else if (payment > 0) {
    drawPill(ctx, x + 12, transactionY, `BAYAR ${compactMoney(payment)}`, { background: '#0284c7', foreground: '#ffffff' }, width - 24, 23, 12)
  } else if (advance > 0) {
    drawPill(ctx, x + 12, transactionY, `PINJAM ${compactMoney(advance)}`, { background: '#d97706', foreground: '#ffffff' }, width - 24, 23, 12)
  }
}

function drawSidebar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, totals: {
  payableDays: number
  fullDays: number
  halfDays: number
  absentDays: number
  earned: number
  covered: number
  received: number
  borrowed: number
  fullCover: number
  partialCover: number
}) {
  roundedRect(ctx, x, y, width, 852, 24)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.stroke()

  setFont(ctx, 21, 900)
  ctx.fillStyle = '#0f172a'
  ctx.fillText('RINGKASAN BULAN', x + 24, y + 38)

  const cards = [
    ['Hari kerja', `${formatUnits(totals.payableDays)} hari`],
    ['Bayaran diterima', money(totals.received)],
    ['Pinjaman diterima', money(totals.borrowed)],
    ['Upah terhasil', money(totals.earned)],
    ['Upah telah cover', money(totals.covered)],
  ]
  cards.forEach(([label, value], index) => {
    const cardY = y + 58 + index * 78
    roundedRect(ctx, x + 20, cardY, width - 40, 64, 14)
    ctx.fillStyle = index === 1 ? '#f0f9ff' : index === 2 ? '#fffbeb' : '#f8fafc'
    ctx.fill()
    setFont(ctx, 13, 800)
    ctx.fillStyle = '#64748b'
    ctx.fillText(label.toUpperCase(), x + 36, cardY + 22)
    setFont(ctx, 22, 900)
    ctx.fillStyle = '#0f172a'
    ctx.fillText(value, x + 36, cardY + 50)
  })

  const detailY = y + 458
  setFont(ctx, 16, 900)
  ctx.fillStyle = '#334155'
  ctx.fillText('ATTENDANCE', x + 24, detailY)
  setFont(ctx, 15, 700)
  ctx.fillStyle = '#64748b'
  ctx.fillText(`${totals.fullDays} penuh · ${totals.halfDays} separa · ${totals.absentDays} tidak hadir`, x + 24, detailY + 28)
  ctx.fillText(`${totals.fullCover} cover penuh · ${totals.partialCover} cover separa`, x + 24, detailY + 53)

  setFont(ctx, 16, 900)
  ctx.fillStyle = '#334155'
  ctx.fillText('LEGEND', x + 24, detailY + 102)

  const legend = [
    ['Penuh', { background: '#dcfce7', foreground: '#166534' }],
    ['1/2 hari', { background: '#fef3c7', foreground: '#92400e' }],
    ['Tidak hadir', { background: '#ffe4e6', foreground: '#9f1239' }],
    ['Upah penuh', { background: '#ede9fe', foreground: '#6d28d9' }],
    ['Upah separa', { background: '#ffedd5', foreground: '#c2410c' }],
    ['Bayaran', { background: '#e0f2fe', foreground: '#0369a1' }],
    ['Pinjaman', { background: '#fef3c7', foreground: '#a16207' }],
  ] as Array<[string, PillStyle]>

  legend.forEach(([label, style], index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    drawPill(ctx, x + 24 + col * 185, detailY + 120 + row * 43, label.toUpperCase(), style, 166, 30, 12)
  })
}

function attendanceStatusStyle(status?: Attendance['status']) {
  if (status === 'present') return { tint: '#10b981', pill: { background: '#dcfce7', foreground: '#166534' } }
  if (status === 'half_day') return { tint: '#f59e0b', pill: { background: '#fef3c7', foreground: '#92400e' } }
  if (status === 'absent') return { tint: '#f43f5e', pill: { background: '#ffe4e6', foreground: '#9f1239' } }
  return { tint: '#cbd5e1', pill: { background: '#f1f5f9', foreground: '#64748b' } }
}

function isFullyCovered(record: Attendance) {
  return record.wage_amount > 0 && record.paid_wage_amount > 0 && record.paid_wage_amount >= record.wage_amount - 0.005
}

function isPartiallyCovered(record: Attendance) {
  return record.wage_amount > 0 && record.paid_wage_amount > 0 && record.paid_wage_amount < record.wage_amount - 0.005
}

function groupTransactions<T>(items: T[], dateOf: (item: T) => string, amountOf: (item: T) => number) {
  const grouped = new Map<string, number>()
  items.forEach((item) => {
    const date = dateOf(item)
    grouped.set(date, roundMoney((grouped.get(date) ?? 0) + Math.max(0, amountOf(item))))
  })
  return grouped
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, style: PillStyle, width: number, height: number, fontSize: number) {
  roundedRect(ctx, x, y, width, height, height / 2)
  ctx.fillStyle = style.background
  ctx.fill()
  setFont(ctx, fontSize, 900)
  ctx.fillStyle = style.foreground
  ctx.textAlign = 'center'
  fitText(ctx, label, x + width / 2, y + height * 0.68, width - 14, 'center')
  ctx.textAlign = 'left'
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, align: CanvasTextAlign = 'left') {
  const original = ctx.textAlign
  ctx.textAlign = align
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y)
    ctx.textAlign = original
    return
  }
  let value = text
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1)
  ctx.fillText(`${value}…`, x, y)
  ctx.textAlign = original
}

function centerText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const original = ctx.textAlign
  ctx.textAlign = 'center'
  ctx.fillText(text, x, y)
  ctx.textAlign = original
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number) {
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG tidak dapat dijana.')), 'image/png', 1)
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function money(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2 }).format(value)
}

function compactMoney(value: number) {
  return `RM${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('en-MY', { maximumFractionDigits: 2 })
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function slug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
