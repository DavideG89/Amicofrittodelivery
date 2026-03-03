import 'server-only'
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function isPrinterAgentAuthorized(request: Request) {
  const expected = process.env.PRINTER_AGENT_KEY || ''
  if (!expected) return { ok: false as const, status: 500, error: 'PRINTER_AGENT_KEY non configurata' }

  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const xKey = (request.headers.get('x-printer-key') || '').trim()
  const provided = bearer || xKey

  if (!provided || !safeCompare(provided, expected)) {
    return { ok: false as const, status: 401, error: 'Non autorizzato' }
  }

  return { ok: true as const }
}

export function parsePrinterId(value: unknown) {
  if (typeof value !== 'string') return 'default'
  const normalized = value.trim()
  if (!normalized) return 'default'
  return normalized.slice(0, 120)
}
