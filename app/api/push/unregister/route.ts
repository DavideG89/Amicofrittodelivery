import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/rate-limit'

const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 })

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
    const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : ''
    const token = typeof body?.token === 'string' ? body.token.trim() : ''

    if (!orderNumber || !token) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    const { error } = await supabase
      .from('customer_push_tokens')
      .delete()
      .eq('order_number', orderNumber)
      .eq('token', token)

    if (error) {
      return NextResponse.json({ error: 'Errore rimozione token' }, { status: 500, headers: rate.headers })
    }

    return NextResponse.json({ ok: true }, { headers: rate.headers })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
