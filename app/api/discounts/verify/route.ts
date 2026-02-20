import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/rate-limit'

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 30 })

function getClientIp(request: Request) {
  const header = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (!header) return 'unknown'
  return header.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = limiter(`discount-verify:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429, headers: rate.headers }
    )
  }

  try {
    const body = await request.json()
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
    const subtotal = Number(body?.subtotal ?? 0)

    if (!code) {
      return NextResponse.json({ error: 'Codice sconto mancante' }, { status: 400, headers: rate.headers })
    }
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return NextResponse.json({ error: 'Subtotale non valido' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    const now = new Date().toISOString()
    const { data: discount, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code)
      .eq('active', true)
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .limit(1)
      .maybeSingle()

    if (error || !discount) {
      return NextResponse.json({ error: 'Codice sconto non valido' }, { status: 404, headers: rate.headers })
    }

    if (subtotal < Number(discount.min_order_amount || 0)) {
      return NextResponse.json(
        { error: 'Ordine minimo non raggiunto', minOrder: Number(discount.min_order_amount || 0) },
        { status: 400, headers: rate.headers }
      )
    }

    let discountAmount = 0
    if (discount.discount_type === 'percentage') {
      discountAmount = (subtotal * Number(discount.discount_value || 0)) / 100
    } else {
      discountAmount = Number(discount.discount_value || 0)
    }
    discountAmount = Math.min(discountAmount, subtotal)

    return NextResponse.json(
      { discountCode: code, discountAmount },
      { headers: rate.headers }
    )
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
