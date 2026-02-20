import { NextResponse } from 'next/server'
import { createAdminSessionToken, ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_MS } from '@/lib/admin-session'
import { createRateLimiter } from '@/lib/rate-limit'
import { timingSafeEqual } from 'crypto'

const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 })

function getClientIp(request: Request) {
  const header = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (!header) return 'unknown'
  return header.split(',')[0]?.trim() || 'unknown'
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = limiter(`admin-login:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova più tardi.' },
      {
        status: 429,
        headers: rate.headers,
      }
    )
  }

  try {
    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password : ''

    const adminPassword = process.env.ADMIN_PASSWORD || ''
    const sessionSecret = process.env.ADMIN_SESSION_SECRET || ''
    if (!adminPassword || !sessionSecret) {
      return NextResponse.json({ error: 'Configurazione admin mancante' }, { status: 500 })
    }

    if (!password || !safeEqual(password, adminPassword)) {
      return NextResponse.json(
        { error: 'Password non corretta' },
        { status: 401, headers: rate.headers }
      )
    }

    const token = createAdminSessionToken(sessionSecret)
    const res = NextResponse.json({ ok: true }, { headers: rate.headers })
    res.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
