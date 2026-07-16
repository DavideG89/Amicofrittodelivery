import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-authorization'

export const runtime = 'nodejs'

const fcmTokenPattern = /^[A-Za-z0-9\-_.:]{80,4096}$/

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
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
