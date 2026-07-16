import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-authorization'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let keepDays = 7
  try {
    const body = await request.json()
    if (typeof body?.keepDays === 'number') keepDays = body.keepDays
  } catch {
    // An empty body uses the documented default.
  }

  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 365) {
    return NextResponse.json({ error: 'Periodo di conservazione non valido' }, { status: 400 })
  }

  const { error } = await auth.supabase.rpc('rollup_and_purge_orders', {
    keep_days: keepDays,
  })

  if (error) {
    console.error('[admin/orders/purge] rollup failed', { code: error.code })
    return NextResponse.json({ error: 'Errore durante la pulizia degli ordini' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
