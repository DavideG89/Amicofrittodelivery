export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type TimeRange = {
  start: string
  end: string
}

export type OrderSchedule = {
  enabled: boolean
  days: Record<DayKey, TimeRange[]>
}

export type OpeningHoursValue =
  | string
  | Record<string, string>
  | {
      display?: string | Record<string, string> | null
      order_schedule?: OrderSchedule | null
    }
  | null

export const dayOrder: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const dayLabels: Record<DayKey, string> = {
  mon: 'Lunedì',
  tue: 'Martedì',
  wed: 'Mercoledì',
  thu: 'Giovedì',
  fri: 'Venerdì',
  sat: 'Sabato',
  sun: 'Domenica',
}

export const dayLabelsShort: Record<DayKey, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mer',
  thu: 'Gio',
  fri: 'Ven',
  sat: 'Sab',
  sun: 'Dom',
}

export function createEmptySchedule(): OrderSchedule {
  return {
    enabled: false,
    days: {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    },
  }
}

export function extractOpeningHours(openingHours: OpeningHoursValue) {
  if (!openingHours) return { display: null, schedule: null }

  if (typeof openingHours === 'string') {
    return { display: openingHours, schedule: null }
  }

  if (typeof openingHours === 'object' && 'order_schedule' in openingHours) {
    const display = (openingHours as { display?: OpeningHoursValue }).display ?? null
    const schedule = (openingHours as { order_schedule?: OrderSchedule | null }).order_schedule ?? null
    return { display, schedule }
  }

  return { display: openingHours as Record<string, string>, schedule: null }
}

export function buildOpeningHoursValue(
  display: string | Record<string, string> | null,
  schedule: OrderSchedule | null
): OpeningHoursValue {
  if (schedule) {
    return {
      display: display ?? null,
      order_schedule: schedule,
    }
  }
  return display ?? null
}

export function normalizeSchedule(schedule: OrderSchedule): OrderSchedule {
  const cleaned: OrderSchedule = {
    enabled: schedule.enabled,
    days: {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    },
  }

  for (const day of dayOrder) {
    const ranges = schedule.days[day] || []
    cleaned.days[day] = ranges
      .filter((range) => range.start && range.end)
      .map((range) => ({ start: range.start, end: range.end }))
  }

  return cleaned
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map((part) => Number(part))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function getDayKey(date: Date): DayKey {
  const jsDay = date.getDay() // 0=Sun..6=Sat
  const index = (jsDay + 6) % 7 // 0=Mon..6=Sun
  return dayOrder[index]
}

export function getOrderStatus(schedule: OrderSchedule | null, now = new Date()) {
  if (!schedule || !schedule.enabled) {
    return { isOpen: true, nextOpen: null as Date | null }
  }

  const hasAnyRange = dayOrder.some((day) => schedule.days[day]?.length)
  if (!hasAnyRange) {
    return { isOpen: false, nextOpen: null as Date | null }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayKey = getDayKey(now)
  const todayRanges = [...(schedule.days[todayKey] || [])].sort((a, b) => {
    const aStart = timeToMinutes(a.start) ?? 0
    const bStart = timeToMinutes(b.start) ?? 0
    return aStart - bStart
  })

  for (const range of todayRanges) {
    const start = timeToMinutes(range.start)
    const end = timeToMinutes(range.end)
    if (start === null || end === null) continue
    if (nowMinutes >= start && nowMinutes < end) {
      return { isOpen: true, nextOpen: null as Date | null }
    }
  }

  // Find next opening slot within the next 7 days
  for (let offset = 0; offset < 7; offset += 1) {
    const checkDate = new Date(now)
    checkDate.setDate(now.getDate() + offset)
    const dayKey = getDayKey(checkDate)
    const ranges = [...(schedule.days[dayKey] || [])].sort((a, b) => {
      const aStart = timeToMinutes(a.start) ?? 0
      const bStart = timeToMinutes(b.start) ?? 0
      return aStart - bStart
    })

    for (const range of ranges) {
      const start = timeToMinutes(range.start)
      if (start === null) continue
      if (offset === 0 && start <= nowMinutes) continue

      const nextOpen = new Date(checkDate)
      nextOpen.setHours(Math.floor(start / 60), start % 60, 0, 0)
      return { isOpen: false, nextOpen }
    }
  }

  return { isOpen: false, nextOpen: null as Date | null }
}

export function formatNextOpen(nextOpen: Date | null, now = new Date()) {
  if (!nextOpen) return null

  const time = nextOpen.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const isSameDay = nextOpen.toDateString() === now.toDateString()
  if (isSameDay) return time

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (nextOpen.toDateString() === tomorrow.toDateString()) {
    return `domani ${time}`
  }

  const dayKey = getDayKey(nextOpen)
  return `${dayLabels[dayKey]} ${time}`
}
