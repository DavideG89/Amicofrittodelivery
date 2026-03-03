import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { isPrinterAgentAuthorized, parsePrinterId } from '@/lib/printer-agent-auth'

export const runtime = 'nodejs'

const ORDER_SELECT =
  'id, order_number, customer_name, customer_phone, customer_address, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, status, notes, created_at, updated_at'

export async function POST(request: Request) {
  const auth = isPrinterAgentAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const printerId = parsePrinterId(body?.printerId)
    const nowIso = new Date().toISOString()
    const supabase = getSupabaseServerClient()

    const { data: candidates, error: candidatesError } = await supabase
      .from('print_jobs')
      .select('id, order_id, order_number, trigger_status, attempt_count, max_attempts')
      .eq('status', 'pending')
      .lte('next_retry_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(10)

    if (candidatesError) {
      return NextResponse.json({ error: 'Errore lettura coda stampa' }, { status: 500 })
    }
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ job: null })
    }

    let claimed: {
      id: string
      order_id: string
      order_number: string
      trigger_status: string
      attempt_count: number
      max_attempts: number
    } | null = null

    for (const candidate of candidates) {
      const nextAttempt = Number(candidate.attempt_count || 0) + 1
      const { data: updated } = await supabase
        .from('print_jobs')
        .update({
          status: 'processing',
          attempt_count: nextAttempt,
          claimed_at: nowIso,
          claimed_by: printerId,
          last_error: null,
        })
        .eq('id', candidate.id)
        .eq('status', 'pending')
        .select('id, order_id, order_number, trigger_status, attempt_count, max_attempts')
        .maybeSingle()

      if (updated) {
        claimed = {
          id: updated.id,
          order_id: updated.order_id,
          order_number: updated.order_number,
          trigger_status: updated.trigger_status,
          attempt_count: Number(updated.attempt_count || nextAttempt),
          max_attempts: Number(updated.max_attempts || 5),
        }
        break
      }
    }

    if (!claimed) {
      return NextResponse.json({ job: null })
    }

    const [{ data: order }, { data: storeInfo }] = await Promise.all([
      supabase.from('orders').select(ORDER_SELECT).eq('id', claimed.order_id).maybeSingle(),
      supabase.from('store_info').select('name, phone, address').limit(1).maybeSingle(),
    ])

    if (!order) {
      await supabase
        .from('print_jobs')
        .update({
          status: 'error',
          last_error: 'Ordine non trovato durante claim',
        })
        .eq('id', claimed.id)
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({
      job: {
        id: claimed.id,
        orderId: claimed.order_id,
        orderNumber: claimed.order_number,
        triggerStatus: claimed.trigger_status,
        attempt: claimed.attempt_count,
        maxAttempts: claimed.max_attempts,
        order,
        storeInfo: storeInfo || null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
