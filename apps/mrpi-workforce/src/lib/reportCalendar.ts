export type ReportCalendarMonth = {
  key: string
  label: string
  dates: Array<string | null>
}

export function buildReportCalendarMonths(
  fromDate: string,
  toDate: string,
  attendanceDates: string[],
  fallbackDate: string,
) {
  const sortedDates = [...attendanceDates].sort()
  const firstDate = fromDate || sortedDates[0] || fallbackDate
  const lastDate = toDate || sortedDates.at(-1) || fallbackDate
  const firstMonth = monthKey(firstDate)
  const lastMonth = monthKey(lastDate)
  if (!firstMonth || !lastMonth || firstMonth > lastMonth) return []

  const months: ReportCalendarMonth[] = []
  let cursor = firstMonth
  while (cursor <= lastMonth) {
    months.push(buildMonth(cursor))
    cursor = nextMonth(cursor)
  }
  return months
}

function buildMonth(key: string): ReportCalendarMonth {
  const [year, month] = key.split('-').map(Number)
  const firstDay = new Date(year ?? 1970, (month ?? 1) - 1, 1)
  const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate()
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7
  const cellCount = Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7
  const dates = Array.from({ length: cellCount }, (_, index) => {
    const day = index - mondayFirstOffset + 1
    return day >= 1 && day <= daysInMonth
      ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null
  })

  return {
    key,
    label: new Intl.DateTimeFormat('ms-MY', { month: 'long', year: 'numeric' }).format(firstDay),
    dates,
  }
}

function monthKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : ''
}

function nextMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  const next = new Date(year ?? 1970, month ?? 1, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}
