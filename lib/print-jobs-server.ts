import 'server-only'

type EnqueuePrintJobInput = {
  orderId: string
  orderNumber: string
  triggerStatus: string
  dedupeKey?: string | null
  printerTarget?: string | null
  payload?: Record<string, unknown> | null
}

type EnqueuePrintJobResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string }

const UNIQUE_VIOLATION = '23505'

export async function enqueuePrintJob(supabase: any, input: EnqueuePrintJobInput): Promise<EnqueuePrintJobResult> {
  const row = {
    order_id: input.orderId,
    order_number: input.orderNumber,
    trigger_status: input.triggerStatus,
    status: 'pending',
    next_retry_at: new Date().toISOString(),
    printer_target: input.printerTarget ?? null,
    dedupe_key: input.dedupeKey ?? null,
    payload: input.payload ?? null,
    last_error: null,
    claimed_at: null,
    claimed_by: null,
    printed_at: null,
  }

  const { error } = await supabase.from('print_jobs').insert(row)
  if (!error) return { ok: true }

  if ((error as { code?: string })?.code === UNIQUE_VIOLATION && input.dedupeKey) {
    return { ok: true, duplicate: true }
  }

  return { ok: false, error: error.message || 'Errore inserimento print job' }
}
