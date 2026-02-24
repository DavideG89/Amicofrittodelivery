import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { sendFcmMessages } from '@/lib/fcm'

export const runtime = 'nodejs'

const statusText: Record<string, { title: string; body: (orderNumber: string) => string }> = {
  confirmed: {
    title: 'Ordine confermato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato confermato.  `,
  },
  preparing: {
    title: 'Ordine in preparazione',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è in preparazione. 🍳`,
  },
  ready: {
    title: 'Ordine pronto',
    body: (orderNumber) => `Il rider ha preso l’ordine ${orderNumber} in consegna. 🛵`,
  },
  completed: {
    title: 'Ordine completato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato completato. Buon appetito! 😊`,
  },
  cancelled: {
    title: 'Ordine annullato',
    body: (orderNumber) => `Il tuo ordine ${orderNumber} è stato annullato.❌`,
  },
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    if (
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return NextResponse.json({ error: 'Supabase env mancanti' }, { status: 500 })
    }

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )

    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const supabase = getSupabaseServerClient()
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (!adminUser) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    const body = await request.json()
    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const status = typeof body?.status === 'string' ? body.status : ''

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
    }

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
      try {
        const { data: tokensData } = await supabase
          .from('customer_push_tokens')
          .select('token')
          .eq('order_number', order.order_number)

        const tokens = [...new Set((tokensData || []).map((row) => row.token).filter(Boolean))]
        if (tokens.length > 0) {
          const clickAction = `/track/${order.order_number}`
          const results = await sendFcmMessages(tokens, {
            title: notification.title,
            body: notification.body(order.order_number),
            clickAction,
            data: {
              order_number: order.order_number,
              status,
            },
          })

          const invalidTokens = results
            .filter((result) => {
              if (result.ok) return false
              if (result.status === 404) return true
              const errorText = (result.error || '').toUpperCase()
              return (
                errorText.includes('UNREGISTERED') ||
                errorText.includes('REGISTRATION_TOKEN_NOT_REGISTERED')
              )
            })
            .map((result) => result.token)

          if (invalidTokens.length > 0) {
            await supabase.from('customer_push_tokens').delete().in('token', invalidTokens)
          }
        }
      } catch (pushError) {
        console.error('[v0] Push notification failed:', pushError)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] Error updating order status:', error)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
