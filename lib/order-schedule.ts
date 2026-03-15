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
      delivery_area?: {
        polygon?: [number, number][] | null
      } | null
      [key: string]: unknown
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

export const ORDER_SCHEDULE_TIME_ZONE = 'Europe/Rome'

export type OrderScheduleNextOpen = {
  day: DayKey
  time: string
  dayOffset: number
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

export function extractOpeningHours(
  openingHours: OpeningHoursValue
): { display: string | Record<string, string> | null; schedule: OrderSchedule | null } {
  if (!openingHours) return { display: null, schedule: null }

  if (typeof openingHours === 'string') {
    return { display: openingHours, schedule: null }
  }

  if (typeof openingHours === 'object' && 'order_schedule' in openingHours) {
    const displayValue = (openingHours as { display?: unknown }).display
    const display =
      typeof displayValue === 'string'
        ? displayValue
        : displayValue && typeof displayValue === 'object'
          ? (displayValue as Record<string, string>)
          : null
    const schedule = (openingHours as { order_schedule?: OrderSchedule | null }).order_schedule ?? null
    return { display, schedule }
  }

  return { display: openingHours as Record<string, string>, schedule: null }
}

export function buildOpeningHoursValue(
  display: string | Record<string, string> | null,
  schedule: OrderSchedule | null,
  existing?: OpeningHoursValue
): OpeningHoursValue {
  const extras: Record<string, unknown> = {}
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing)) {
      if (key === 'display' || key === 'order_schedule') continue
      extras[key] = value
    }
  }

  const hasExtras = Object.keys(extras).length > 0
  if (schedule || hasExtras) {
    return {
      ...extras,
      display: display ?? null,
      order_schedule: schedule ?? null,
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

function isRangeOpenAtMinutes(nowMinutes: number, start: number, end: number) {
  // Same start/end means 24h for that day.
  if (start === end) return true
  if (end > start) {
    return nowMinutes >= start && nowMinutes < end
  }
  // Overnight range (e.g. 22:00 -> 02:00 or 16:15 -> 00:00)
  return nowMinutes >= start || nowMinutes < end
}

function getPreviousDayKey(day: DayKey): DayKey {
  const index = dayOrder.indexOf(day)
  if (index <= 0) return dayOrder[dayOrder.length - 1]
  return dayOrder[index - 1]
}

function getDayKeyFromLocalDate(date: Date): DayKey {
  const jsDay = date.getDay() // 0=Sun..6=Sat
  const index = (jsDay + 6) % 7 // 0=Mon..6=Sun
  return dayOrder[index]
}

const orderScheduleClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ORDER_SCHEDULE_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayMap: Record<string, DayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
}

function getOrderScheduleClock(date: Date) {
  const parts = orderScheduleClockFormatter.formatToParts(date)
  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value || ''
  const hourRaw = Number(parts.find((part) => part.type === 'hour')?.value)
  const minuteRaw = Number(parts.find((part) => part.type === 'minute')?.value)
  const hours = Number.isFinite(hourRaw) ? hourRaw : date.getHours()
  const minutes = Number.isFinite(minuteRaw) ? minuteRaw : date.getMinutes()

  return {
    dayKey: weekdayMap[weekdayRaw] || getDayKeyFromLocalDate(date),
    minutes: hours * 60 + minutes,
  }
}

function minutesToTime(value: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, value))
  const h = String(Math.floor(normalized / 60)).padStart(2, '0')
  const m = String(normalized % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function getCurrentOrderScheduleClock(now = new Date()) {
  return getOrderScheduleClock(now)
}

export function getOrderStatus(schedule: OrderSchedule | null, now = new Date()) {
  if (!schedule || !schedule.enabled) {
    return { isOpen: true, nextOpen: null as OrderScheduleNextOpen | null }
  }

  const hasAnyRange = dayOrder.some((day) => schedule.days[day]?.length)
  if (!hasAnyRange) {
    return { isOpen: false, nextOpen: null as OrderScheduleNextOpen | null }
  }

  const { minutes: nowMinutes, dayKey: todayKey } = getOrderScheduleClock(now)
  const todayRanges = [...(schedule.days[todayKey] || [])].sort((a, b) => {
    const aStart = timeToMinutes(a.start) ?? 0
    const bStart = timeToMinutes(b.start) ?? 0
    return aStart - bStart
  })

  for (const range of todayRanges) {
    const start = timeToMinutes(range.start)
    const end = timeToMinutes(range.end)
    if (start === null || end === null) continue
    if (isRangeOpenAtMinutes(nowMinutes, start, end)) {
      return { isOpen: true, nextOpen: null as OrderScheduleNextOpen | null }
    }
  }

  // Keep open after midnight for previous-day overnight slots (e.g. Fri 22:00-02:00 on Sat 01:00).
  const previousDayKey = getPreviousDayKey(todayKey)
  const previousDayRanges = schedule.days[previousDayKey] || []
  for (const range of previousDayRanges) {
    const start = timeToMinutes(range.start)
    const end = timeToMinutes(range.end)
    if (start === null || end === null) continue
    if (end < start && nowMinutes < end) {
      return { isOpen: true, nextOpen: null as OrderScheduleNextOpen | null }
    }
  }

  // Find next opening slot within the next 7 days
  for (let offset = 0; offset < 7; offset += 1) {
    const checkDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    const dayKey = offset === 0 ? todayKey : getOrderScheduleClock(checkDate).dayKey
    const ranges = [...(schedule.days[dayKey] || [])].sort((a, b) => {
      const aStart = timeToMinutes(a.start) ?? 0
      const bStart = timeToMinutes(b.start) ?? 0
      return aStart - bStart
    })

    for (const range of ranges) {
      const start = timeToMinutes(range.start)
      if (start === null) continue
      if (offset === 0 && start <= nowMinutes) continue

      return {
        isOpen: false,
        nextOpen: {
          day: dayKey,
          time: minutesToTime(start),
          dayOffset: offset,
        },
      }
    }
  }

  return { isOpen: false, nextOpen: null as OrderScheduleNextOpen | null }
}

export function formatNextOpen(nextOpen: OrderScheduleNextOpen | null) {
  if (!nextOpen) return null

  if (nextOpen.dayOffset === 0) return nextOpen.time
  if (nextOpen.dayOffset === 1) return `domani ${nextOpen.time}`
  return `${dayLabels[nextOpen.day]} ${nextOpen.time}`
}
