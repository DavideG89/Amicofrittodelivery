import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-authorization'

export const runtime = 'nodejs'

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
