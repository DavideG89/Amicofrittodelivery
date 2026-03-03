import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { isPrinterAgentAuthorized } from '@/lib/printer-agent-auth'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeRetrySeconds(value: unknown) {
  if (typeof value !== 'number') return 30
  if (!Number.isFinite(value)) return 30
  return Math.min(Math.max(Math.round(value), 10), 900)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = isPrinterAgentAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { jobId } = await params
  if (!UUID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: 'jobId non valido' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const retryInSeconds = normalizeRetrySeconds(body?.retryInSeconds)
  const errorMessage = typeof body?.error === 'string' ? body.error.trim().slice(0, 400) : 'Errore stampa'

  const supabase = getSupabaseServerClient()
  const { data: current, error: currentError } = await supabase
    .from('print_jobs')
    .select('id, attempt_count, max_attempts')
    .eq('id', jobId)
    .maybeSingle()

  if (currentError) {
    return NextResponse.json({ error: 'Errore recupero print job' }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'Print job non trovato' }, { status: 404 })
  }

  const attempts = Number(current.attempt_count || 0)
  const maxAttempts = Number(current.max_attempts || 5)
  const permanentError = attempts >= maxAttempts
  const nextRetryAt = new Date(Date.now() + retryInSeconds * 1000).toISOString()

  const { error } = await supabase
    .from('print_jobs')
    .update({
      status: permanentError ? 'error' : 'pending',
      last_error: errorMessage || 'Errore stampa',
      next_retry_at: nextRetryAt,
      claimed_at: null,
      claimed_by: null,
    })
    .eq('id', jobId)

  if (error) {
    return NextResponse.json({ error: 'Errore aggiornamento print job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, permanentError })
}
