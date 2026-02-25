export function normalizeOrderNumber(value: unknown): string {
  if (Array.isArray(value)) {
    return normalizeOrderNumber(value[0])
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).trim().toUpperCase()
  }

  if (typeof value !== 'string') return ''

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }

  return decoded.replace(/\s+/g, '').trim().toUpperCase().replace(/^#+/, '')
}
