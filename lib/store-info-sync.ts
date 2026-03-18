import { supabase, type StoreInfo } from '@/lib/supabase'

const STORE_INFO_SELECT = 'id, name, address, phone, opening_hours, delivery_fee, min_order_delivery, updated_at'

export async function fetchStoreInfo(): Promise<StoreInfo | null> {
  const { data, error } = await supabase
    .from('store_info')
    .select(STORE_INFO_SELECT)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

type SubscribeStoreInfoOptions = {
  onUpdate: (value: StoreInfo | null) => void
  onError?: (error: unknown) => void
  pollMs?: number
}

export function subscribeToStoreInfo({
  onUpdate,
  onError,
  pollMs = 60000,
}: SubscribeStoreInfoOptions) {
  let closed = false
  let pollingId: number | null = null
  let inFlight = false
  let channel: ReturnType<typeof supabase.channel> | null = null

  const refresh = async () => {
    if (closed || inFlight) return
    inFlight = true
    try {
      const next = await fetchStoreInfo()
      if (!closed) onUpdate(next)
    } catch (error) {
      if (!closed) onError?.(error)
    } finally {
      inFlight = false
    }
  }

  const stopPolling = () => {
    if (pollingId === null || typeof window === 'undefined') return
    window.clearInterval(pollingId)
    pollingId = null
  }

  const startPolling = () => {
    if (pollingId !== null || typeof window === 'undefined') return
    pollingId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refresh()
    }, pollMs)
  }

  const canUseRealtime =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof WebSocket !== 'undefined'

  if (canUseRealtime) {
    try {
      channel = supabase
        .channel(`store_info_changes_${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_info' }, () => {
          void refresh()
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            stopPolling()
            void refresh()
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            startPolling()
          }
        })
    } catch {
      startPolling()
    }
  } else {
    startPolling()
  }

  const handleFocus = () => {
    void refresh()
  }
  const handleVisibility = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState !== 'visible') return
    void refresh()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility)
  }

  void refresh()

  return () => {
    closed = true
    stopPolling()
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    if (channel) {
      void supabase.removeChannel(channel)
    }
  }
}
