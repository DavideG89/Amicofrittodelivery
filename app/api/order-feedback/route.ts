import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { normalizeOrderNumber } from '@/lib/order-number'
import { normalizeOrderPublicToken } from '@/lib/order-public-token'

export const runtime = 'nodejs'

const allowedReasons = new Set([
  'prodotto freddo',
  'poco saporito',
  'cotto male',
  'ordine in ritardo',
  'consegna rovinata',
  'problema consegna',
  'ordine sbagliato',
  'mancava qualcosa',
])

type FeedbackReason = {
  category: 'Food' | 'Delivery' | 'Accuratezza'
  label: string
}

function normalizeReason(value: unknown): FeedbackReason | null {
  if (!value || typeof value !== 'object') return null
  const reason = value as { category?: unknown; label?: unknown }
  const category = typeof reason.category === 'string' ? reason.category.trim() : ''
  const label = typeof reason.label === 'string' ? reason.label.trim().toLowerCase() : ''

  if (category !== 'Food' && category !== 'Delivery' && category !== 'Accuratezza') return null
  if (!allowedReasons.has(label)) return null

  return { category, label }
}

function normalizeReasons(value: unknown): FeedbackReason[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const reasons: FeedbackReason[] = []

  for (const item of value) {
    const reason = normalizeReason(item)
    if (!reason) continue
    const key = `${reason.category}:${reason.label}`
    if (seen.has(key)) continue
    seen.add(key)
    reasons.push(reason)
    if (reasons.length >= 3) break
  }

  return reasons
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderNumber = normalizeOrderNumber(body?.orderNumber)
    const publicToken = normalizeOrderPublicToken(body?.publicToken)
    const rating = Number(body?.rating)
    const reasons = normalizeReasons(body?.reasons)

    if (!orderNumber) {
      return NextResponse.json({ error: 'Numero ordine non valido' }, { status: 400 })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating non valido' }, { status: 400 })
    }
    if (rating <= 3 && reasons.length === 0) {
      return NextResponse.json({ error: 'Seleziona almeno un motivo' }, { status: 400 })
    }
    if (rating >= 4 && reasons.length > 0) {
      return NextResponse.json({ error: 'Motivi non validi per questo rating' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const query = supabase
      .from('orders')
      .select('order_number, status')
      .eq('order_number', orderNumber)

    const { data: order, error: orderError } = await (publicToken
      ? query.eq('public_token', publicToken)
      : query.is('public_token', null)
    )
      .maybeSingle()

    if (orderError) {
      return NextResponse.json({ error: 'Errore verifica ordine' }, { status: 500 })
    }
    if (!order || order.status !== 'completed') {
      return NextResponse.json({ error: 'Feedback disponibile solo per ordini completati' }, { status: 403 })
    }

    const { error: feedbackError } = await supabase
      .from('order_feedback')
      .upsert(
        {
          order_number: orderNumber,
          rating,
          reasons,
        },
        { onConflict: 'order_number' }
      )

    if (feedbackError) {
      return NextResponse.json({ error: 'Errore salvataggio feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
