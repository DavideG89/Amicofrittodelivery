import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { validateOrderData, sanitizeOrderData, sanitizeString } from '@/lib/validation'
import { createRateLimiter } from '@/lib/rate-limit'

type OrderItem = {
  product_id: string
  name: string
  price: number
  quantity: number
  additions?: string | null
  additions_unit_price?: number | null
  additions_ids?: string[] | null
}

type OrderPayload = {
  customer_name: string
  customer_phone: string
  customer_address: string | null
  order_type: 'delivery' | 'takeaway'
  items: OrderItem[]
  subtotal: number
  discount_code: string | null
  discount_amount: number
  delivery_fee: number
  total: number
  status: 'pending'
  notes: string | null
  payment_method: 'cash' | 'card' | null
}

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20 })

function getClientIp(request: Request) {
  const header = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (!header) return 'unknown'
  return header.split(',')[0]?.trim() || 'unknown'
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

async function verifyRecaptcha(token: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) {
    throw new Error('Missing RECAPTCHA_SECRET_KEY')
  }

  const form = new URLSearchParams()
  form.append('secret', secret)
  form.append('response', token)

  const res = await fetchWithTimeout('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: form,
  }, 8000)

  const data = await res.json()
  return data
}

async function getNextOrderNumber(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const lastNumber = data?.order_number ?? null
  const match = typeof lastNumber === 'string' ? lastNumber.match(/^AF(\d+)$/) : null
  const lastNumeric = match ? parseInt(match[1], 10) : 0
  const nextNumeric = Number.isFinite(lastNumeric) && lastNumeric > 0 ? lastNumeric + 1 : 1

  return `AF${String(nextNumeric).padStart(6, '0')}`
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = limiter(`orders:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429, headers: rate.headers }
    )
  }

  try {
    const body = await request.json()
    const recaptchaToken = String(body?.recaptchaToken || '')
    const order = body?.order as OrderPayload | undefined
    const disableRecaptcha =
      process.env.DISABLE_RECAPTCHA === 'true' || process.env.NODE_ENV === 'development'

    if (!disableRecaptcha) {
      if (!recaptchaToken) {
        return NextResponse.json({ error: 'Token captcha mancante' }, { status: 400 })
      }

      const captchaResult = await verifyRecaptcha(recaptchaToken)
      if (!captchaResult?.success) {
        return NextResponse.json(
          { error: 'Verifica captcha fallita', details: captchaResult?.['error-codes'] || null },
          { status: 403 }
        )
      }
    }

    if (!order) {
      return NextResponse.json({ error: 'Dati ordine mancanti' }, { status: 400 })
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Carrello vuoto' }, { status: 400 })
    }

    if (order.order_type !== 'delivery' && order.order_type !== 'takeaway') {
      return NextResponse.json({ error: 'Tipo ordine non valido' }, { status: 400 })
    }

    const validation = validateOrderData({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address ?? '',
      notes: order.notes ?? '',
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors[0] }, { status: 400 })
    }

    if (order.order_type === 'delivery' && !order.customer_address) {
      return NextResponse.json({ error: 'Indirizzo di consegna richiesto' }, { status: 400 })
    }

    const sanitized = sanitizeOrderData({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address,
      notes: order.notes,
    })

    const supabase = getSupabaseServerClient()
    const orderNumber = await getNextOrderNumber(supabase)

    const items = order.items.map((item) => ({
      product_id: String(item.product_id || ''),
      quantity: Number(item.quantity || 0),
      additions: item.additions ? sanitizeString(String(item.additions), 160) : null,
      additions_ids: Array.isArray(item.additions_ids)
        ? item.additions_ids.filter((id): id is string => typeof id === 'string')
        : [],
    }))

    if (items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return NextResponse.json({ error: 'Carrello non valido' }, { status: 400 })
    }

    const productIds = [...new Set(items.map((item) => item.product_id))]
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, available')
      .in('id', productIds)

    if (productsError) {
      return NextResponse.json({ error: 'Errore verifica prodotti' }, { status: 500 })
    }

    const productMap = new Map(productsData?.map((product) => [product.id, product]) ?? [])
    const additionIds = [...new Set(items.flatMap((item) => item.additions_ids))]
    const additionsMap = new Map<string, { type: 'sauce' | 'extra'; name: string; price: number }>()

    if (additionIds.length > 0) {
      const { data: additionsData, error: additionsError } = await supabase
        .from('order_additions')
        .select('id, type, name, price, active')
        .in('id', additionIds)
        .eq('active', true)

      if (additionsError) {
        return NextResponse.json({ error: 'Errore verifica aggiunte' }, { status: 500 })
      }

      for (const addition of additionsData || []) {
        additionsMap.set(addition.id, {
          type: addition.type as 'sauce' | 'extra',
          name: addition.name,
          price: Number(addition.price || 0),
        })
      }
    }

    const normalizedItems = items.map((item) => {
      const product = productMap.get(item.product_id)
      const normalizedAdditionIds = [...new Set(item.additions_ids)].filter((id) => additionsMap.has(id))
      const selectedAdditions = normalizedAdditionIds
        .map((id) => additionsMap.get(id))
        .filter((value): value is { type: 'sauce' | 'extra'; name: string; price: number } => Boolean(value))
      const sauce = selectedAdditions.find((addition) => addition.type === 'sauce')
      const extras = selectedAdditions.filter((addition) => addition.type === 'extra')
      const additionsLabelParts: string[] = []
      if (sauce) additionsLabelParts.push(`Salsa: ${sauce.name}`)
      if (extras.length > 0) additionsLabelParts.push(`Extra: ${extras.map((extra) => extra.name).join(', ')}`)
      const additionsUnitPrice = selectedAdditions.reduce((sum, addition) => sum + Number(addition.price || 0), 0)

      return {
        product_id: item.product_id,
        name: product?.name ?? '',
        price: product?.price ?? 0,
        quantity: Math.min(Math.floor(item.quantity), 99),
        additions: additionsLabelParts.join(' | ') || null,
        additions_unit_price: Math.round(additionsUnitPrice * 100) / 100,
        additions_ids: normalizedAdditionIds,
        available: product?.available ?? false,
      }
    })

    if (normalizedItems.some((item) => !item.name || !item.available)) {
      return NextResponse.json({ error: 'Prodotti non disponibili' }, { status: 400 })
    }

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + (item.price + (item.additions_unit_price || 0)) * item.quantity,
      0
    )
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return NextResponse.json({ error: 'Totale non valido' }, { status: 400 })
    }

    const { data: storeInfo } = await supabase
      .from('store_info')
      .select('delivery_fee, min_order_delivery')
      .limit(1)
      .maybeSingle()

    const deliveryFee = order.order_type === 'delivery' ? Number(storeInfo?.delivery_fee || 0) : 0
    const minOrderDelivery = Number(storeInfo?.min_order_delivery || 0)
    if (order.order_type === 'delivery' && minOrderDelivery > 0 && subtotal < minOrderDelivery) {
      return NextResponse.json({ error: 'Ordine minimo non raggiunto' }, { status: 400 })
    }

    let discountCode: string | null = order.discount_code ? order.discount_code.toUpperCase() : null
    let discountAmount = 0

    if (discountCode) {
      const now = new Date().toISOString()
      const { data: discount, error: discountError } = await supabase
        .from('discount_codes')
        .select('discount_type, discount_value, min_order_amount')
        .eq('code', discountCode)
        .eq('active', true)
        .lte('valid_from', now)
        .or(`valid_until.is.null,valid_until.gte.${now}`)
        .limit(1)
        .maybeSingle()

      if (!discountError && discount) {
        if (subtotal >= Number(discount.min_order_amount || 0)) {
          if (discount.discount_type === 'percentage') {
            discountAmount = (subtotal * Number(discount.discount_value || 0)) / 100
          } else {
            discountAmount = Number(discount.discount_value || 0)
          }
          discountAmount = Math.min(discountAmount, subtotal)
        } else {
          discountCode = null
        }
      } else {
        discountCode = null
      }
    }

    const total = subtotal + deliveryFee - discountAmount
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: 'Totale non valido' }, { status: 400 })
    }

    const paymentMethod = order.payment_method === 'cash' || order.payment_method === 'card'
      ? order.payment_method
      : null

    const { error } = await supabase.from('orders').insert({
      order_number: orderNumber,
      customer_name: sanitized.customer_name,
      customer_phone: sanitized.customer_phone,
      customer_address: sanitized.customer_address,
      order_type: order.order_type,
      items: normalizedItems.map(({ available, ...item }) => item),
      subtotal,
      discount_code: discountCode,
      discount_amount: discountAmount,
      delivery_fee: deliveryFee,
      total,
      status: 'pending',
      notes: sanitized.notes,
      payment_method: paymentMethod,
    })

    if (error) {
      return NextResponse.json({ error: 'Errore salvataggio ordine' }, { status: 500 })
    }

    return NextResponse.json({ orderNumber }, { headers: rate.headers })
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    const message = err?.name === 'AbortError' ? 'Timeout verifica captcha' : 'Errore server'
    const details =
      process.env.NODE_ENV !== 'production'
        ? { message: err?.message || String(error), name: err?.name }
        : undefined
    return NextResponse.json({ error: message, details }, { status: 500, headers: rate.headers })
  }
}
