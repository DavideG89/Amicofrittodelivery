import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminSessionToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-session'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { sendFcmMessages } from '@/lib/fcm'

const statusText: Record<string, { title: string; body: (orderNumber: string) => string }> = {
  confirmed: {
    title: 'Ordine confermato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato confermato. Stiamo iniziando a prepararlo.`,
  },
  preparing: {
    title: 'Ordine in preparazione',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è in preparazione.`,
  },
  ready: {
    title: 'Ordine pronto',
    body: (orderNumber) => `Il rider ha preso l’ordine ${orderNumber} in consegna.`,
  },
  completed: {
    title: 'Ordine completato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato completato. Grazie!`,
  },
  cancelled: {
    title: 'Ordine annullato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato annullato.`,
  },
}

export async function POST(request: Request) {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || ''
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value || ''
  if (!sessionSecret || !token || !verifyAdminSessionToken(token, sessionSecret)) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const status = typeof body?.status === 'string' ? body.status : ''

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)

    if (updateError) {
      return NextResponse.json({ error: 'Errore aggiornamento ordine' }, { status: 500 })
    }

    const notification = statusText[status]
    if (notification) {
      const { data: tokensData } = await supabase
        .from('customer_push_tokens')
        .select('token')
        .eq('order_number', order.order_number)

      const tokens = (tokensData || []).map((row) => row.token).filter(Boolean)
      if (tokens.length > 0) {
        const clickAction = `/order/${order.order_number}`
        await sendFcmMessages(tokens, {
          title: notification.title,
          body: notification.body(order.order_number),
          clickAction,
          data: {
            order_number: order.order_number,
            status,
          },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] Error updating order status:', error)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
