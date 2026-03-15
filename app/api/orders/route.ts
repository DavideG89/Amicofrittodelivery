import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { validateOrderData, sanitizeOrderData, sanitizeString } from '@/lib/validation'
import { createRateLimiter } from '@/lib/rate-limit'
import { DEFAULT_SAUCE_RULE, getFallbackSauceRuleByCategorySlug, normalizeSauceRule, SauceRule } from '@/lib/sauce-rules'
import { sendFcmMessages } from '@/lib/fcm'
import { normalizeOrderNumber } from '@/lib/order-number'
import { buildProductNameWithPieceOption, normalizeProductPieceOptions, type ProductPieceOption } from '@/lib/product-piece-options'
import { normalizeUpsellProductOverrides } from '@/lib/upsell-overrides'
import type { OrderStatus } from '@/lib/supabase'
import { getDeliveryPolygonFromOpeningHours, isDeliveryPolygonReady, isPointInsideDeliveryPolygon } from '@/lib/delivery-area'
import { extractOpeningHours, getOrderStatus } from '@/lib/order-schedule'

type OrderItem = {
  product_id: string
  item_source?: 'menu' | 'upsell'
  name: string
  price: number
  quantity: number
  piece_option_id?: string | null
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
type DiscountOrderTypeScope = 'all' | 'delivery' | 'takeaway'

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20 })
const readLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120 })
const geocodeCache = new Map<string, { lat: number; lng: number; expiresAt: number }>()
const geocodeCacheTtlMs = 6 * 60 * 60 * 1000
const PUBLIC_ORDER_SELECT =
  'order_number, status, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, created_at, updated_at'
const PUBLIC_ORDER_LIGHT_SELECT = 'order_number, status, updated_at'
const GLOBAL_DISCOUNT_MIN_ORDER = 6

function normalizeDiscountOrderTypeScope(value: unknown): DiscountOrderTypeScope {
  if (value === 'delivery' || value === 'takeaway' || value === 'all') return value
  return 'all'
}

function isDiscountAllowedForOrderType(scope: DiscountOrderTypeScope, orderType: 'delivery' | 'takeaway') {
  return scope === 'all' || scope === orderType
}

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

function buildAdminDashboardLink(orderId: string) {
  const path = `/admin/dashboard?orderId=${encodeURIComponent(orderId)}`
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

function maskToken(token: string) {
  if (!token) return ''
  if (token.length <= 16) return token
  return `${token.slice(0, 8)}...${token.slice(-8)}`
}

async function notifyAdminsOnNewOrder(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  payload: { orderId: string; orderNumber: string; orderType: 'delivery' | 'takeaway'; total: number; createdAt: string }
) {
  try {
    const maxTokensFromEnv = Number(process.env.ADMIN_PUSH_MAX_TOKENS || 5000)
    const maxTokens = Number.isFinite(maxTokensFromEnv) && maxTokensFromEnv > 0 ? Math.floor(maxTokensFromEnv) : 5000
    const activeDaysFromEnv = Number(process.env.ADMIN_PUSH_ACTIVE_DAYS || 180)
    const activeDays = Number.isFinite(activeDaysFromEnv) && activeDaysFromEnv > 0 ? Math.floor(activeDaysFromEnv) : 180
    const activeSince = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: tokensData, error: tokensError } = await supabase
      .from('admin_push_tokens')
      .select('token')
      .gte('last_seen', activeSince)
      .order('last_seen', { ascending: false })
      .limit(maxTokens)

    if (tokensError || !tokensData || tokensData.length === 0) return

    const tokens = [...new Set(tokensData.map((row) => row.token).filter(Boolean))]
    if (tokens.length === 0) return

    const clickAction = buildAdminDashboardLink(payload.orderId)
    const results = await sendFcmMessages(tokens, {
      title: 'Nuovo ordine',
      body: `Ordine ${payload.orderNumber} • euro ${Number(payload.total).toFixed(2)}`,
      clickAction,
      data: {
        orderId: payload.orderId,
        order_id: payload.orderId,
        order_number: payload.orderNumber,
        order_type: payload.orderType,
        total: Number(payload.total).toFixed(2),
        created_at: payload.createdAt,
      },
    })

    const failedResults = results.filter((result) => !result.ok)
    if (failedResults.length > 0) {
      console.error('[orders-api] Admin push delivery errors', {
        total: results.length,
        failed: failedResults.length,
        failures: failedResults.map((result) => ({
          token: maskToken(result.token),
          status: result.status,
          error: result.error,
        })),
      })
    } else {
      console.info('[orders-api] Admin push delivered', { total: results.length })
    }

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isMissingProductOverridesColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = `${maybeError.message || ''} ${maybeError.details || ''} ${maybeError.hint || ''}`.toLowerCase()
  return maybeError.code === '42703' || (text.includes('product_overrides') && text.includes('column'))
}

function isMissingDiscountScopeColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = `${maybeError.message || ''} ${maybeError.details || ''} ${maybeError.hint || ''}`.toLowerCase()
  return maybeError.code === '42703' || (text.includes('order_type_scope') && text.includes('column'))
}

function parsePiecesFromItemName(itemName: string | null) {
  if (!itemName) return null
  const match = itemName.match(/(\d+)\s*(?:x|×|pezzi?)/i)
  if (!match) return null
  const pieces = Number(match[1])
  if (!Number.isFinite(pieces) || pieces <= 0) return null
  return Math.floor(pieces)
}

function normalizePrice(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function resolvePieceOption(
  pieceOptions: ProductPieceOption[],
  selectedId: string | null,
  itemName: string | null,
  itemPrice: number | null
) {
  if (pieceOptions.length === 0) return null

  if (selectedId) {
    const selectedById = pieceOptions.find((option) => option.id === selectedId)
    if (selectedById) return selectedById
  }

  const normalizedItemPrice = normalizePrice(itemPrice)
  if (normalizedItemPrice !== null) {
    const matchedByPrice = pieceOptions.filter((option) => normalizePrice(option.price) === normalizedItemPrice)
    if (matchedByPrice.length === 1) return matchedByPrice[0]
  }

  const requestedPieces = parsePiecesFromItemName(itemName)
  if (requestedPieces !== null) {
    const matchedByPieces = pieceOptions.filter((option) => option.pieces === requestedPieces)
    if (matchedByPieces.length === 1) return matchedByPieces[0]
  }

  if (pieceOptions.length === 1) {
    return pieceOptions[0]
  }

  return null
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

function normalizeGeocodeKey(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function withCountryHint(address: string) {
  return /\bitalia\b/i.test(address) ? address : `${address}, Italia`
}

async function geocodeDeliveryAddress(rawAddress: string) {
  const key = normalizeGeocodeKey(rawAddress)
  if (!key) return null

  const cached = geocodeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { lat: cached.lat, lng: cached.lng }
  }

  const query = withCountryHint(rawAddress)
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'localhost'
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'it-IT,it;q=0.9',
        'User-Agent': `AmicoFrittoDelivery/1.0 (${siteUrl})`,
      },
      cache: 'no-store',
    },
    6000
  )

  if (!response.ok) {
    return null
  }

  const data = (await response.json().catch(() => null)) as
    | Array<{ lat?: string | number; lon?: string | number }>
    | null

  if (!Array.isArray(data) || data.length === 0) {
    return null
  }

  const lat = Number(data[0]?.lat)
  const lng = Number(data[0]?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }

  geocodeCache.set(key, {
    lat,
    lng,
    expiresAt: Date.now() + geocodeCacheTtlMs,
  })

  return { lat, lng }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function generateFallbackOrderNumber() {
  const epochSeconds = Math.floor(Date.now() / 1000) % 1_000_000
  const randomSuffix = Math.floor(Math.random() * 1000)
  return `AF${String(epochSeconds).padStart(6, '0')}${String(randomSuffix).padStart(3, '0')}`
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
    .like('order_number', 'AF%')
    .order('order_number', { ascending: false })
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

    const items = order.items.map((item) => ({
      product_id: String(item.product_id || ''),
      item_source: item.item_source === 'upsell' ? 'upsell' : 'menu',
      quantity: Number(item.quantity || 0),
      name: typeof item.name === 'string' ? sanitizeString(item.name, 160) : null,
      price: Number(item.price),
      piece_option_id: typeof item.piece_option_id === 'string' ? item.piece_option_id.trim().slice(0, 64) : null,
      additions: item.additions ? sanitizeString(String(item.additions), 160) : null,
      additions_ids: Array.isArray(item.additions_ids)
        ? item.additions_ids.filter((id): id is string => typeof id === 'string')
        : [],
    }))

    if (items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return NextResponse.json({ error: 'Carrello non valido' }, { status: 400 })
    }

    const productIds = [...new Set(items.map((item) => item.product_id))]
    if (productIds.some((id) => !isUuid(id))) {
      return NextResponse.json({ error: 'ID prodotto non valido' }, { status: 400 })
    }

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, category_id, name, price, available, piece_options')
      .in('id', productIds)

    if (productsError) {
      console.error('[orders-api] Product verification error:', productsError)
      return NextResponse.json(
        {
          error: 'Errore verifica prodotti',
          details:
            process.env.NODE_ENV !== 'production'
              ? {
                  message: productsError.message,
                  code: productsError.code,
                  details: productsError.details,
                  hint: productsError.hint,
                }
              : undefined,
        },
        { status: 500 }
      )
    }

    const productMap = new Map(productsData?.map((product) => [product.id, product]) ?? [])
    const hasUpsellItems = items.some((item) => item.item_source === 'upsell')
    const upsellConfiguredMap = new Map<string, { name: string; price: number }>()

    if (hasUpsellItems) {
      let settingsData: { enabled?: boolean; product_ids?: string[]; product_overrides?: unknown } | null = null

      const { data: settingsWithOverrides, error: settingsError } = await supabase
        .from('upsell_settings')
        .select('enabled, product_ids, product_overrides')
        .eq('id', 'default')
        .maybeSingle()

      if (settingsError && isMissingProductOverridesColumnError(settingsError)) {
        const { data: fallbackSettings } = await supabase
          .from('upsell_settings')
          .select('enabled, product_ids')
          .eq('id', 'default')
          .maybeSingle()
        settingsData = (fallbackSettings as { enabled?: boolean; product_ids?: string[] } | null) || null
      } else if (!settingsError) {
        settingsData = (settingsWithOverrides as { enabled?: boolean; product_ids?: string[]; product_overrides?: unknown } | null) || null
      }

      const restrictedIds = Array.isArray(settingsData?.product_ids)
        ? settingsData.product_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []
      const hasRestrictedList = restrictedIds.length > 0
      const restrictedSet = new Set(restrictedIds)
      const overrides = normalizeUpsellProductOverrides(settingsData?.product_overrides)
      const isUpsellEnabled = settingsData ? settingsData.enabled !== false : true

      if (isUpsellEnabled) {
        for (const [productId, product] of productMap) {
          if (hasRestrictedList && !restrictedSet.has(productId)) continue
          const override = overrides[productId]
          const isAvailable = typeof override?.available === 'boolean' ? override.available : Boolean(product.available)
          if (!isAvailable) continue

          const normalizedOverrideName =
            typeof override?.name === 'string' && override.name.trim()
              ? sanitizeString(override.name.trim(), 160)
              : ''
          const overridePrice = Number(override?.price)
          const normalizedOverridePrice =
            Number.isFinite(overridePrice) && overridePrice >= 0
              ? Math.round(overridePrice * 100) / 100
              : null

          const upsellName = normalizedOverrideName || String(product.name || '').trim()
          const upsellPrice =
            normalizedOverridePrice !== null
              ? normalizedOverridePrice
              : Math.round(Number(product.price || 0) * 100) / 100

          if (!upsellName || !Number.isFinite(upsellPrice) || upsellPrice < 0) continue
          upsellConfiguredMap.set(productId, { name: upsellName, price: upsellPrice })
        }
      }
    }

    const additionIds = [...new Set(items.flatMap((item) => item.additions_ids))]
    const hasRequestedAdditions = additionIds.length > 0
    const categorySlugMap = new Map<string, string>()
    const sauceRulesMap = new Map<string, SauceRule>()
    const additionsMap = new Map<string, { type: 'sauce' | 'extra'; name: string; price: number }>()

    if (hasRequestedAdditions) {
      const categoryIds = [
        ...new Set(
          (productsData ?? [])
            .map((product) => product.category_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        ),
      ]

      const categoriesPromise =
        categoryIds.length > 0
          ? supabase.from('categories').select('id, slug').in('id', categoryIds)
          : Promise.resolve({ data: null, error: null })

      const additionsPromise = supabase
        .from('order_additions')
        .select('id, type, name, price, active')
        .in('id', additionIds)
        .eq('active', true)

      const [{ data: categoriesData }, { data: additionsData, error: additionsError }] = await Promise.all([
        categoriesPromise,
        additionsPromise,
      ])

      if (additionsError) {
        return NextResponse.json({ error: 'Errore verifica aggiunte' }, { status: 500 })
      }

      for (const category of categoriesData || []) {
        categorySlugMap.set(category.id, String(category.slug || '').toLowerCase())
      }

      for (const addition of additionsData || []) {
        additionsMap.set(addition.id, {
          type: addition.type as 'sauce' | 'extra',
          name: addition.name,
          price: Number(addition.price || 0),
        })
      }

      const categorySlugs = [...new Set(Array.from(categorySlugMap.values()).filter(Boolean))]
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
    }

    let additionsValidationError: string | null = null
    let pieceOptionsValidationError: string | null = null
    let upsellValidationError: string | null = null
    const normalizedItems = items.map((item) => {
      const product = productMap.get(item.product_id)
      const quantity = Math.min(Math.floor(item.quantity), 99)

      if (item.item_source === 'upsell') {
        const upsellConfigured = upsellConfiguredMap.get(item.product_id) || null
        if (!upsellConfigured && !upsellValidationError) {
          const fallbackName = product?.name || item.name || 'prodotto'
          upsellValidationError = `Prodotto upsell non valido: ${fallbackName}`
        }

        return {
          product_id: item.product_id,
          item_source: 'upsell' as const,
          name: upsellConfigured?.name || '',
          price: upsellConfigured?.price ?? 0,
          quantity,
          piece_option_id: null,
          additions: null,
          additions_unit_price: 0,
          additions_ids: [],
          available: Boolean(upsellConfigured),
        }
      }

      const pieceOptions = normalizeProductPieceOptions(product?.piece_options)
      const selectedPieceOption = resolvePieceOption(pieceOptions, item.piece_option_id, item.name, item.price)

      if (pieceOptions.length > 0 && !selectedPieceOption && !pieceOptionsValidationError) {
        const productName = product?.name || 'prodotto'
        pieceOptionsValidationError = `Seleziona una quantità valida per ${productName}`
      }

      const itemName =
        product?.name && selectedPieceOption
          ? buildProductNameWithPieceOption(product.name, selectedPieceOption)
          : product?.name ?? ''
      const itemPrice = selectedPieceOption ? selectedPieceOption.price : product?.price ?? 0

      if (!hasRequestedAdditions) {
        return {
          product_id: item.product_id,
          item_source: 'menu' as const,
          name: itemName,
          price: itemPrice,
          quantity,
          piece_option_id: selectedPieceOption?.id || null,
          additions: null,
          additions_unit_price: 0,
          additions_ids: [],
          available: product?.available ?? false,
        }
      }

      const categorySlug = product?.category_id ? categorySlugMap.get(product.category_id) || '' : ''
      const sauceRule =
        sauceRulesMap.get(categorySlug) ||
        getFallbackSauceRuleByCategorySlug(categorySlug) ||
        DEFAULT_SAUCE_RULE
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
        item_source: 'menu' as const,
        name: itemName,
        price: itemPrice,
        quantity,
        piece_option_id: selectedPieceOption?.id || null,
        additions: additionsLabelParts.join(' | ') || null,
        additions_unit_price: Math.round(additionsUnitPrice * 100) / 100,
        additions_ids: normalizedAdditionIds,
        available: product?.available ?? false,
      }
    })

    if (additionsValidationError) {
      return NextResponse.json({ error: additionsValidationError }, { status: 400 })
    }

    if (pieceOptionsValidationError) {
      return NextResponse.json({ error: pieceOptionsValidationError }, { status: 400 })
    }

    if (upsellValidationError) {
      return NextResponse.json({ error: upsellValidationError }, { status: 400 })
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
      .select('delivery_fee, min_order_delivery, opening_hours')
      .limit(1)
      .maybeSingle()

    const { schedule } = extractOpeningHours(storeInfo?.opening_hours ?? null)
    const orderStatus = getOrderStatus(schedule)
    if (!orderStatus.isOpen) {
      return NextResponse.json({ error: 'Ordinazioni chiuse al momento' }, { status: 400 })
    }

    let deliveryFee = 0
    if (order.order_type === 'delivery') {
      deliveryFee = Number(storeInfo?.delivery_fee || 0)
      const minOrderDelivery = Number(storeInfo?.min_order_delivery || 0)
      if (minOrderDelivery > 0 && subtotal < minOrderDelivery) {
        return NextResponse.json({ error: 'Ordine minimo non raggiunto' }, { status: 400 })
      }

      const deliveryPolygon = getDeliveryPolygonFromOpeningHours(storeInfo?.opening_hours ?? null)
      if (isDeliveryPolygonReady(deliveryPolygon)) {
        const deliveryAddress = String(order.customer_address || '').trim()
        if (!deliveryAddress) {
          return NextResponse.json({ error: 'Indirizzo di consegna richiesto' }, { status: 400 })
        }

        const geocoded = await geocodeDeliveryAddress(deliveryAddress)
        if (!geocoded) {
          return NextResponse.json(
            { error: 'Impossibile verificare l indirizzo. Sarà un indirizzo estero o al di fuori dalla nostra area di consegna.' },
            { status: 400 }
          )
        }

        if (!isPointInsideDeliveryPolygon([geocoded.lat, geocoded.lng], deliveryPolygon)) {
          return NextResponse.json({ error: 'Delivery non disponibile in questa zona, ci dispiace' }, { status: 400 })
        }
      }
    }

    let discountCode: string | null = order.discount_code ? order.discount_code.toUpperCase() : null
    let discountAmount = 0

    if (discountCode) {
      const now = new Date().toISOString()
      const primaryDiscountResponse = await supabase
        .from('discount_codes')
        .select('discount_type, discount_value, min_order_amount, order_type_scope')
        .eq('code', discountCode)
        .eq('active', true)
        .lte('valid_from', now)
        .or(`valid_until.is.null,valid_until.gte.${now}`)
        .limit(1)
        .maybeSingle()

      let discount = primaryDiscountResponse.data as
        | { discount_type: 'percentage' | 'fixed'; discount_value: number; min_order_amount: number; order_type_scope: string | null }
        | null
      let discountError = primaryDiscountResponse.error

      if (isMissingDiscountScopeColumnError(discountError)) {
        const fallbackDiscountResponse = await supabase
          .from('discount_codes')
          .select('discount_type, discount_value, min_order_amount')
          .eq('code', discountCode)
          .eq('active', true)
          .lte('valid_from', now)
          .or(`valid_until.is.null,valid_until.gte.${now}`)
          .limit(1)
          .maybeSingle()

        discount = fallbackDiscountResponse.data
          ? {
              ...fallbackDiscountResponse.data,
              order_type_scope: 'all',
            }
          : null
        discountError = fallbackDiscountResponse.error
      }

      if (!discountError && discount) {
        const orderTypeScope = normalizeDiscountOrderTypeScope(discount.order_type_scope)
        if (isDiscountAllowedForOrderType(orderTypeScope, order.order_type)) {
          const minOrderAmount = Math.max(GLOBAL_DISCOUNT_MIN_ORDER, Number(discount.min_order_amount || 0))
          if (subtotal >= minOrderAmount) {
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

    const maxInsertAttempts = 20
    const maxFallbackInsertAttempts = 20
    let orderNumber = ''
    let insertedOrder: { id: string; created_at: string } | null = null
    let insertError: {
      message?: string
      code?: string
      details?: string
      hint?: string
    } | null = null

    const insertOrder = async (candidateOrderNumber: string) => {
      return supabase
        .from('orders')
        .insert({
          order_number: candidateOrderNumber,
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
        .select('id, created_at')
        .single()
    }

    for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
      orderNumber = await getNextOrderNumber(supabase)
      const { data, error } = await insertOrder(orderNumber)

      if (!error && data) {
        insertedOrder = data
        insertError = null
        break
      }

      const duplicateOrderNumber =
        error?.code === '23505' &&
        `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('order_number')

      insertError = error
      if (!duplicateOrderNumber) break
      // Desynchronize concurrent inserts racing on the next sequential AF number.
      await sleep(15 + Math.floor(Math.random() * 70) + attempt * 10)
    }

    const duplicateAfterSequentialRetries =
      insertError?.code === '23505' &&
      `${insertError?.message || ''} ${insertError?.details || ''}`.toLowerCase().includes('order_number')

    if (!insertedOrder && duplicateAfterSequentialRetries) {
      for (let attempt = 0; attempt < maxFallbackInsertAttempts; attempt += 1) {
        orderNumber = generateFallbackOrderNumber()
        const { data, error } = await insertOrder(orderNumber)
        if (!error && data) {
          insertedOrder = data
          insertError = null
          break
        }

        const duplicateFallback =
          error?.code === '23505' &&
          `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('order_number')
        insertError = error
        if (!duplicateFallback) break
      }
    }

    if (!insertedOrder || insertError) {
      console.error('[orders-api] Order insert error:', insertError)
      return NextResponse.json(
        {
          error: 'Errore salvataggio ordine',
          details:
            process.env.NODE_ENV !== 'production'
              ? {
                  message: insertError?.message,
                  code: insertError?.code,
                  details: insertError?.details,
                  hint: insertError?.hint,
                }
              : undefined,
        },
        { status: 500 }
      )
    }

    void notifyAdminsOnNewOrder(supabase, {
      orderId: insertedOrder?.id || orderNumber,
      orderNumber,
      orderType: order.order_type,
      total,
      createdAt: insertedOrder?.created_at || new Date().toISOString(),
    })

    return NextResponse.json({ orderNumber }, { headers: rate.headers })
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    console.error('[orders-api] Unhandled POST error:', error)
    const message = err?.name === 'AbortError' ? 'Timeout verifica captcha' : 'Errore server'
    const details =
      process.env.NODE_ENV !== 'production'
        ? { message: err?.message || String(error), name: err?.name }
        : undefined
    return NextResponse.json({ error: message, details }, { status: 500, headers: rate.headers })
  }
}
