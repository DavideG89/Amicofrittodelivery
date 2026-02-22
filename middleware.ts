import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'admin_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

const encoder = new TextEncoder()

function base64UrlToBytes(input: string) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function isValidSession(token: string, secret: string) {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [timestampRaw, signature] = parts
  const timestamp = Number(timestampRaw)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false
  if (Date.now() - timestamp > SESSION_TTL_MS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(timestampRaw))
  const expected = new Uint8Array(signed)
  const actual = base64UrlToBytes(signature)
  return timingSafeEqual(expected, actual)
}

export async function middleware(request: NextRequest) {
  // If Supabase Auth is configured for admin access, let the client-side
  // session check in the dashboard layout handle gating.
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''
  if (adminEmail) {
    return NextResponse.next()
  }

  const secret = process.env.ADMIN_SESSION_SECRET || ''
  const token = request.cookies.get(SESSION_COOKIE)?.value || ''

  if (!secret || !token) {
    const url = new URL('/admin/login', request.url)
    return NextResponse.redirect(url)
  }

  const valid = await isValidSession(token, secret)
  if (!valid) {
    const url = new URL('/admin/login', request.url)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
}
