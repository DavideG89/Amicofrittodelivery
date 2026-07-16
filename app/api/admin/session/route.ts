import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-authorization'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
