import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const fcmTokenPattern = /^[A-Za-z0-9\-_.:]{80,4096}$/

async function requireAdminAuth(authHeader: string) {
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return { ok: false as const, status: 401, error: 'Non autorizzato' }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { ok: false as const, status: 500, error: 'Supabase env mancanti' }
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
    return { ok: false as const, status: 401, error: 'Non autorizzato' }
  }

  const supabase = getSupabaseServerClient()
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (!adminUser) {
    return { ok: false as const, status: 403, error: 'Non autorizzato' }
  }

  return { ok: true as const, supabase }
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request.headers.get('authorization') || '')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const token = typeof body?.token === 'string' ? body.token.trim() : ''

    if (!token) {
      return NextResponse.json({ error: 'Token mancante' }, { status: 400 })
    }
    if (!fcmTokenPattern.test(token)) {
      return NextResponse.json({ error: 'Token push non valido' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('admin_push_tokens')
      .delete()
      .eq('token', token)

    if (error) {
      return NextResponse.json({ error: 'Errore rimozione token nativo' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
