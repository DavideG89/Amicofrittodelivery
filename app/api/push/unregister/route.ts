import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/rate-limit'
import { normalizeOrderPublicToken } from '@/lib/order-public-token'

const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 })
const orderNumberPattern = /^[A-Z0-9-]{4,32}$/
const fcmTokenPattern = /^[A-Za-z0-9\-_.:]{80,4096}$/

function getClientIp(request: Request) {
  const header = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (!header) return 'unknown'
  return header.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = limiter(`push-unregister:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429, headers: rate.headers }
    )
  }

  try {
    const body = await request.json()
    const orderNumber =
      typeof body?.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : ''
    const publicToken = normalizeOrderPublicToken(body?.publicToken)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''

    if (!orderNumber || !token) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400, headers: rate.headers })
    }
    if (!orderNumberPattern.test(orderNumber)) {
      return NextResponse.json({ error: 'orderNumber non valido' }, { status: 400, headers: rate.headers })
    }
    if (!fcmTokenPattern.test(token)) {
      return NextResponse.json({ error: 'Token push non valido' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    const orderQuery = supabase
      .from('orders')
      .select('order_number')
      .eq('order_number', orderNumber)
      .limit(1)

    const { data: orderExists, error: orderCheckError } = await (publicToken
      ? orderQuery.eq('public_token', publicToken)
      : orderQuery.is('public_token', null)
    )
      .maybeSingle()

    if (orderCheckError) {
      return NextResponse.json({ error: 'Errore verifica ordine' }, { status: 500, headers: rate.headers })
    }
    if (!orderExists) {
      return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404, headers: rate.headers })
    }

    const { error } = await supabase
      .from('customer_push_tokens')
      .delete()
      .eq('order_number', orderNumber)
      .eq('token', token)

    if (error) {
      console.error('[push/unregister] failed', {
        code: error.code,
        message: error.message,
        details: error.details,
      })
      return NextResponse.json({ error: 'Errore rimozione token' }, { status: 500, headers: rate.headers })
    }

    return NextResponse.json({ ok: true }, { headers: rate.headers })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
