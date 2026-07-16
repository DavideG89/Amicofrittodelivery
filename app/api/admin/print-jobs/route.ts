import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-authorization'
import { enqueuePrintJob } from '@/lib/print-jobs-server'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
    const triggerStatus = typeof body?.triggerStatus === 'string' ? body.triggerStatus.trim().slice(0, 64) : 'manual'
    const printerTarget = typeof body?.printerTarget === 'string' ? body.printerTarget.trim().slice(0, 120) : ''

    if (!orderId || !UUID_PATTERN.test(orderId)) {
      return NextResponse.json({ error: 'orderId non valido' }, { status: 400 })
    }

    const { data: order, error: orderError } = await auth.supabase
      .from('orders')
      .select('id, order_number')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError) {
      return NextResponse.json({ error: 'Errore recupero ordine' }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    }

    const queued = await enqueuePrintJob(auth.supabase, {
      orderId: order.id,
      orderNumber: order.order_number,
      triggerStatus: triggerStatus || 'manual',
      printerTarget: printerTarget || null,
    })

    if (!queued.ok) {
      return NextResponse.json({ error: queued.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
