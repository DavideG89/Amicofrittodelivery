import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
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

  if (!adminUser) return { ok: false as const, status: 403, error: 'Non autorizzato' }

  return { ok: true as const, supabase }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data, error } = await auth.supabase
      .from('order_feedback')
      .select('id, order_number, rating, reasons, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      return NextResponse.json({ error: 'Errore recupero feedback' }, { status: 500 })
    }

    const rows = data || []
    const average =
      rows.length > 0
        ? rows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / rows.length
        : 0

    return NextResponse.json({
      feedback: rows,
      summary: {
        count: rows.length,
        average,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
}
