import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const SESSION_SEPARATOR = '.'

export function createAdminSessionToken(secret: string, now = Date.now()): string {
  const timestamp = String(now)
  const signature = createHmac('sha256', secret).update(timestamp).digest('base64url')
  return `${timestamp}${SESSION_SEPARATOR}${signature}`
}

export function verifyAdminSessionToken(token: string, secret: string, now = Date.now()): boolean {
  const parts = token.split(SESSION_SEPARATOR)
  if (parts.length !== 2) return false

  const [timestampRaw, signature] = parts
  const timestamp = Number(timestampRaw)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false

  if (now - timestamp > SESSION_TTL_MS) return false

  const expected = createHmac('sha256', secret).update(timestampRaw).digest('base64url')
  const signatureBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)
  if (signatureBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(signatureBuf, expectedBuf)
}

export const ADMIN_SESSION_COOKIE = 'admin_session'
export const ADMIN_SESSION_TTL_MS = SESSION_TTL_MS
