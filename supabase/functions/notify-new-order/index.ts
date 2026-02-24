import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.6.1'

type OrderPayload = {
  order_id: string
  order_number: string
  order_type: string
  total: number
  created_at: string
}

type WebhookPayload = {
  record?: OrderPayload
} & Partial<OrderPayload>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') ?? ''
const firebaseClientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? ''
const firebasePrivateKey = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')
const adminDashboardUrl = Deno.env.get('ADMIN_DASHBOARD_URL') ?? ''
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') ?? ''

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function getAccessToken() {
  const key = await importPKCS8(firebasePrivateKey, 'RS256')
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(firebaseClientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to get access token: ${text}`)
  }

  const data = await res.json()
  return data.access_token as string
}

async function sendFcm(accessToken: string, token: string, payload: OrderPayload) {
  const title = 'Nuovo ordine'
  const body = `Ordine ${payload.order_number} • €${payload.total}`
  const clickAction = buildOrderLink(payload.order_number)

  const message = {
    message: {
      token,
      notification: { title, body },
      data: {
        order_id: payload.order_id,
        order_number: payload.order_number,
        order_type: payload.order_type,
        total: String(payload.total),
        created_at: payload.created_at,
        click_action: clickAction
      },
      webpush: {
        fcm_options: {
          link: clickAction || undefined
        },
        notification: {
          title,
          body,
          icon: '/icons/icon-star.svg',
          data: { click_action: clickAction }
        }
      }
    }
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    }
  )

  const text = await res.text()
  if (!res.ok) {
    const error = new Error(text)
    ;(error as { status?: number }).status = res.status
    throw error
  }
  console.log(`[FCM] ok token=${token.slice(0, 10)}… response=${text}`)
}

function buildOrderLink(orderNumber: string) {
  if (!adminDashboardUrl) return `/admin/dashboard/orders?order=${encodeURIComponent(orderNumber)}`
  const base = adminDashboardUrl.replace(/\/$/, '')
  if (base.endsWith('/admin/dashboard')) {
    return `${base}/orders?order=${encodeURIComponent(orderNumber)}`
  }
  return `${base}/admin/dashboard/orders?order=${encodeURIComponent(orderNumber)}`
}

function extractPayload(body: WebhookPayload): OrderPayload | null {
  if (body.record?.order_id) return body.record
  if (body.order_id) {
    return {
      order_id: body.order_id,
      order_number: body.order_number ?? '',
      order_type: body.order_type ?? '',
      total: body.total ?? 0,
      created_at: body.created_at ?? ''
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (webhookSecret) {
    const secret = req.headers.get('x-webhook-secret') ?? ''
    if (secret !== webhookSecret) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500)
  }
  if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    return jsonResponse({ error: 'Missing Firebase env vars' }, 500)
  }

  const body = (await req.json().catch(() => ({}))) as WebhookPayload
  const payload = extractPayload(body)
  if (!payload) {
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })

  const { data: tokens, error } = await supabase
    .from('admin_push_tokens')
    .select('token')
    .order('last_seen', { ascending: false })
    .limit(1000)

  if (error) {
    return jsonResponse({ error: 'Failed to load tokens' }, 500)
  }

  if (!tokens || tokens.length === 0) {
    return jsonResponse({ ok: true, sent: 0 })
  }

  const accessToken = await getAccessToken()

  const results = await Promise.allSettled(
    tokens.map(async ({ token }) => {
      try {
        await sendFcm(accessToken, token, payload)
        return token
      } catch (err) {
        const error = err as Error & { status?: number; token?: string }
        error.token = token
        throw error
      }
    })
  )

  const invalidTokens: string[] = []
  for (const result of results) {
    if (result.status === 'rejected') {
      const err = result.reason as Error & { status?: number; token?: string }
      if (err.status === 404 || err.message.includes('UNREGISTERED')) {
        if (err.token) invalidTokens.push(err.token)
      }
    }
  }

  if (invalidTokens.length > 0) {
    await supabase.from('admin_push_tokens').delete().in('token', invalidTokens)
  }

  return jsonResponse({
    ok: true,
    sent: tokens.length,
    invalid: invalidTokens.length
  })
})
