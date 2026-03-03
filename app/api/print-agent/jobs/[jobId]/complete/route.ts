import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { isPrinterAgentAuthorized } from '@/lib/printer-agent-auth'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  const nowIso = new Date().toISOString()
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('print_jobs')
    .update({
      status: 'printed',
      printed_at: nowIso,
      last_error: null,
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Errore aggiornamento print job' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Print job non trovato o non in processing' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
