import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/rate-limit'

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 30 })
const GLOBAL_DISCOUNT_MIN_ORDER = 6
type OrderType = 'delivery' | 'takeaway'
type DiscountOrderTypeScope = 'all' | OrderType

function normalizeOrderType(value: unknown): OrderType | null {
  if (value === 'delivery' || value === 'takeaway') return value
  return null
}

function normalizeDiscountOrderTypeScope(value: unknown): DiscountOrderTypeScope {
  if (value === 'delivery' || value === 'takeaway' || value === 'all') return value
  return 'all'
}

function isDiscountAllowedForOrderType(scope: DiscountOrderTypeScope, orderType: OrderType) {
  return scope === 'all' || scope === orderType
}

function isMissingDiscountScopeColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = `${maybeError.message || ''} ${maybeError.details || ''} ${maybeError.hint || ''}`.toLowerCase()
  return maybeError.code === '42703' || (text.includes('order_type_scope') && text.includes('column'))
}

function getOrderTypeLabel(orderType: DiscountOrderTypeScope) {
  if (orderType === 'delivery') return 'delivery'
  if (orderType === 'takeaway') return 'ritiro'
  return 'delivery e ritiro'
}

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
    const orderType = normalizeOrderType(body?.orderType)

    if (!code) {
      return NextResponse.json({ error: 'Codice sconto mancante' }, { status: 400, headers: rate.headers })
    }
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return NextResponse.json({ error: 'Subtotale non valido' }, { status: 400, headers: rate.headers })
    }
    if (!orderType) {
      return NextResponse.json({ error: 'Tipo ordine non valido' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    const now = new Date().toISOString()
    const primaryDiscountResponse = await supabase
      .from('discount_codes')
      .select('discount_type, discount_value, min_order_amount, order_type_scope')
      .eq('code', code)
      .eq('active', true)
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .limit(1)
      .maybeSingle()

    let discount = primaryDiscountResponse.data as
      | { discount_type: 'percentage' | 'fixed'; discount_value: number; min_order_amount: number; order_type_scope: string | null }
      | null
    let error = primaryDiscountResponse.error

    if (isMissingDiscountScopeColumnError(error)) {
      const fallbackResponse = await supabase
        .from('discount_codes')
        .select('discount_type, discount_value, min_order_amount')
        .eq('code', code)
        .eq('active', true)
        .lte('valid_from', now)
        .or(`valid_until.is.null,valid_until.gte.${now}`)
        .limit(1)
        .maybeSingle()

      discount = fallbackResponse.data
        ? {
            ...fallbackResponse.data,
            order_type_scope: 'all',
          }
        : null
      error = fallbackResponse.error
    }

    if (error || !discount) {
      return NextResponse.json({ error: 'Codice sconto non valido' }, { status: 404, headers: rate.headers })
    }

    const orderTypeScope = normalizeDiscountOrderTypeScope(discount.order_type_scope)
    if (!isDiscountAllowedForOrderType(orderTypeScope, orderType)) {
      return NextResponse.json(
        { error: `Codice sconto valido solo per ${getOrderTypeLabel(orderTypeScope)}` },
        { status: 400, headers: rate.headers }
      )
    }

    const minOrderAmount = Math.max(GLOBAL_DISCOUNT_MIN_ORDER, Number(discount.min_order_amount || 0))
    if (subtotal < minOrderAmount) {
      return NextResponse.json(
        { error: 'Ordine minimo non raggiunto', minOrder: minOrderAmount },
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
