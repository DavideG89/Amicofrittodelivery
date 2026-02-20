import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { validateOrderData, sanitizeOrderData } from '@/lib/validation'

type OrderItem = {
  product_id: string
  name: string
  price: number
  quantity: number
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
  try {
    const body = await request.json()
    const recaptchaToken = String(body?.recaptchaToken || '')
    const order = body?.order as OrderPayload | undefined

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

    if (!order) {
      return NextResponse.json({ error: 'Dati ordine mancanti' }, { status: 400 })
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Carrello vuoto' }, { status: 400 })
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

    const { error } = await supabase.from('orders').insert({
      order_number: orderNumber,
      customer_name: sanitized.customer_name,
      customer_phone: sanitized.customer_phone,
      customer_address: sanitized.customer_address,
      order_type: order.order_type,
      items: order.items,
      subtotal: order.subtotal,
      discount_code: order.discount_code ? order.discount_code.toUpperCase() : null,
      discount_amount: order.discount_amount,
      delivery_fee: order.delivery_fee,
      total: order.total,
      status: 'pending',
      notes: sanitized.notes,
      payment_method: order.order_type === 'delivery' ? order.payment_method : null,
    })

    if (error) {
      return NextResponse.json({ error: 'Errore salvataggio ordine' }, { status: 500 })
    }

    return NextResponse.json({ orderNumber })
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Timeout verifica captcha' : 'Errore server'
    const details =
      process.env.NODE_ENV !== 'production'
        ? { message: error?.message || String(error), name: error?.name }
        : undefined
    return NextResponse.json({ error: message, details }, { status: 500 })
  }
}
