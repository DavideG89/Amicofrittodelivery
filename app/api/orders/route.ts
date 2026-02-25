import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { validateOrderData, sanitizeOrderData, sanitizeString } from '@/lib/validation'
import { createRateLimiter } from '@/lib/rate-limit'
import { DEFAULT_SAUCE_RULE, getFallbackSauceRuleByCategorySlug, normalizeSauceRule, SauceRule } from '@/lib/sauce-rules'
import { sendFcmMessages } from '@/lib/fcm'
import { normalizeOrderNumber } from '@/lib/order-number'
import type { OrderStatus } from '@/lib/supabase'

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
const readLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120 })
const PUBLIC_ORDER_SELECT =
  'order_number, status, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, created_at, updated_at'
const PUBLIC_ORDER_LIGHT_SELECT = 'order_number, status, updated_at'

function normalizePublicStatus(value: unknown): OrderStatus {
  if (
    value === 'pending' ||
    value === 'confirmed' ||
    value === 'preparing' ||
    value === 'ready' ||
    value === 'completed' ||
    value === 'cancelled'
  ) {
    return value
  }
  return 'pending'
}

function normalizePublicOrderType(value: unknown): 'delivery' | 'takeaway' {
  return value === 'delivery' ? 'delivery' : 'takeaway'
}

function normalizePublicPaymentMethod(value: unknown): 'cash' | 'card' | null {
  if (value === 'cash' || value === 'card') return value
  return null
}

function sanitizePublicOrder(order: Record<string, unknown>) {
  return {
    order_number: String(order.order_number || ''),
    status: normalizePublicStatus(order.status),
    order_type: normalizePublicOrderType(order.order_type),
    payment_method: normalizePublicPaymentMethod(order.payment_method),
    items: Array.isArray(order.items) ? order.items : [],
    subtotal: Number(order.subtotal || 0),
    discount_code: typeof order.discount_code === 'string' ? order.discount_code : null,
    discount_amount: Number(order.discount_amount || 0),
    delivery_fee: Number(order.delivery_fee || 0),
    total: Number(order.total || 0),
    created_at: String(order.created_at || ''),
    updated_at: typeof order.updated_at === 'string' ? order.updated_at : undefined,
  }
}

function sanitizePublicOrderLight(order: Record<string, unknown>) {
  return {
    order_number: String(order.order_number || ''),
    status: normalizePublicStatus(order.status),
    updated_at: typeof order.updated_at === 'string' ? order.updated_at : undefined,
  }
}

function buildAdminOrdersLink(orderNumber: string) {
  const path = `/admin/dashboard/orders?order=${encodeURIComponent(orderNumber)}`
  const explicitSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
  const baseUrl = explicitSiteUrl || vercelUrl
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

function isInvalidFcmToken(status: number | undefined, errorText: string) {
  if (status === 404) return true
  const normalized = (errorText || '').toUpperCase()
  return (
    normalized.includes('UNREGISTERED') ||
    normalized.includes('REGISTRATION_TOKEN_NOT_REGISTERED')
  )
}

async function notifyAdminsOnNewOrder(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  payload: { orderNumber: string; orderType: 'delivery' | 'takeaway'; total: number; createdAt: string }
) {
  try {
    const { data: tokensData, error: tokensError } = await supabase
      .from('admin_push_tokens')
      .select('token')
      .order('last_seen', { ascending: false })
      .limit(500)

    if (tokensError || !tokensData || tokensData.length === 0) return

    const tokens = [...new Set(tokensData.map((row) => row.token).filter(Boolean))]
    if (tokens.length === 0) return

    const clickAction = buildAdminOrdersLink(payload.orderNumber)
    const results = await sendFcmMessages(tokens, {
      title: 'Nuovo ordine',
      body: `Ordine ${payload.orderNumber} • euro ${Number(payload.total).toFixed(2)}`,
      clickAction,
      data: {
        order_number: payload.orderNumber,
        order_type: payload.orderType,
        total: Number(payload.total).toFixed(2),
        created_at: payload.createdAt,
      },
    })

    const invalidTokens = results
      .filter((result) => !result.ok && isInvalidFcmToken(result.status, result.error || ''))
      .map((result) => result.token)

    if (invalidTokens.length > 0) {
      await supabase.from('admin_push_tokens').delete().in('token', invalidTokens)
    }
  } catch (error) {
    // Best effort: failure here must not block order creation.
    console.error('[orders-api] Admin push notification failed:', error)
  }
}

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

export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rate = readLimiter(`orders-read:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova tra qualche minuto.' },
      { status: 429, headers: rate.headers }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const orderNumber = normalizeOrderNumber(searchParams.get('orderNumber'))
    const light = searchParams.get('light') === 'true'

    if (!orderNumber) {
      return NextResponse.json({ error: 'Numero ordine non valido' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    if (light) {
      const { data, error } = await supabase
        .from('orders')
        .select(PUBLIC_ORDER_LIGHT_SELECT)
        .eq('order_number', orderNumber)
        .maybeSingle()

      if (error) {
        console.error('[orders-api] Read order error:', error)
        return NextResponse.json({ error: 'Errore recupero ordine' }, { status: 500, headers: rate.headers })
      }

      if (!data) {
        return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404, headers: rate.headers })
      }

      return NextResponse.json(
        { order: sanitizePublicOrderLight(data as Record<string, unknown>) },
        {
          headers: {
            ...rate.headers,
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    const { data, error } = await supabase
      .from('orders')
      .select(PUBLIC_ORDER_SELECT)
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (error) {
      console.error('[orders-api] Read order error:', error)
      return NextResponse.json({ error: 'Errore recupero ordine' }, { status: 500, headers: rate.headers })
    }

    if (!data) {
      return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404, headers: rate.headers })
    }

    return NextResponse.json(
      { order: sanitizePublicOrder(data as Record<string, unknown>) },
      {
        headers: {
          ...rate.headers,
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('[orders-api] Error reading order:', error)
    return NextResponse.json({ error: 'Errore server' }, { status: 500, headers: rate.headers })
  }
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
      .select('id, category_id, name, price, available')
      .in('id', productIds)

    if (productsError) {
      return NextResponse.json({ error: 'Errore verifica prodotti' }, { status: 500 })
    }

    const productMap = new Map(productsData?.map((product) => [product.id, product]) ?? [])
    const categoryIds = [
      ...new Set(
        (productsData ?? [])
          .map((product) => product.category_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]
    const categorySlugMap = new Map<string, string>()

    if (categoryIds.length > 0) {
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, slug')
        .in('id', categoryIds)

      for (const category of categoriesData || []) {
        categorySlugMap.set(category.id, String(category.slug || '').toLowerCase())
      }
    }

    const categorySlugs = [...new Set(Array.from(categorySlugMap.values()).filter(Boolean))]
    const sauceRulesMap = new Map<string, SauceRule>()
    if (categorySlugs.length > 0) {
      const { data: rulesData } = await supabase
        .from('order_addition_category_rules')
        .select('category_slug, sauce_mode, max_sauces, sauce_price, active')
        .in('category_slug', categorySlugs)
        .eq('active', true)

      for (const row of rulesData || []) {
        const key = String(row.category_slug || '').toLowerCase()
        if (!key) continue
        sauceRulesMap.set(
          key,
          normalizeSauceRule({
            sauce_mode: row.sauce_mode as SauceRule['sauce_mode'],
            max_sauces: Number(row.max_sauces || 0),
            sauce_price: Number(row.sauce_price || 0),
          })
        )
      }
    }

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

    let additionsValidationError: string | null = null
    const normalizedItems = items.map((item) => {
      const product = productMap.get(item.product_id)
      const categorySlug = product?.category_id ? categorySlugMap.get(product.category_id) || '' : ''
      const sauceRule = sauceRulesMap.get(categorySlug) || getFallbackSauceRuleByCategorySlug(categorySlug) || DEFAULT_SAUCE_RULE
      const normalizedAdditionIds = [...new Set(item.additions_ids)].filter((id) => additionsMap.has(id))
      const selectedAdditions = normalizedAdditionIds
        .map((id) => additionsMap.get(id))
        .filter((value): value is { type: 'sauce' | 'extra'; name: string; price: number } => Boolean(value))
      const sauces = selectedAdditions.filter((addition) => addition.type === 'sauce')
      const extras = selectedAdditions.filter((addition) => addition.type === 'extra')
      if (sauceRule.sauce_mode === 'none' && sauces.length > 0) {
        additionsValidationError = 'Salse non consentite per questo prodotto'
      }
      if (sauceRule.sauce_mode === 'free_single' && sauces.length > 1) {
        additionsValidationError = 'Massimo 1 salsa gratuita per questo prodotto'
      }
      if (sauceRule.sauce_mode === 'paid_multi' && sauces.length > sauceRule.max_sauces) {
        additionsValidationError = `Massimo ${sauceRule.max_sauces} salse per questo prodotto`
      }
      const additionsLabelParts: string[] = []
      if (sauces.length > 0) additionsLabelParts.push(`Salse: ${sauces.map((sauce) => sauce.name).join(', ')}`)
      if (extras.length > 0) additionsLabelParts.push(`Extra: ${extras.map((extra) => extra.name).join(', ')}`)
      const sauceUnitPrice = sauceRule.sauce_mode === 'paid_multi' ? sauces.length * sauceRule.sauce_price : 0
      const extrasUnitPrice = extras.reduce((sum, addition) => sum + Number(addition.price || 0), 0)
      const additionsUnitPrice = sauceUnitPrice + extrasUnitPrice

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

    if (additionsValidationError) {
      return NextResponse.json({ error: additionsValidationError }, { status: 400 })
    }

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

    await notifyAdminsOnNewOrder(supabase, {
      orderNumber,
      orderType: order.order_type,
      total,
      createdAt: new Date().toISOString(),
    })

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
