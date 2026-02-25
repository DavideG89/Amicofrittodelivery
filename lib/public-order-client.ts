import { normalizeOrderNumber } from '@/lib/order-number'
import type { PublicOrder, OrderStatus } from '@/lib/supabase'

export type PublicOrderLight = {
  order_number: string
  status: OrderStatus
  updated_at?: string
}

type FetchOrderOptions = {
  light?: boolean
}

async function fetchOrderInternal<T>(orderNumber: string, options: FetchOrderOptions = {}): Promise<T | null> {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber)
  if (!normalizedOrderNumber) return null

  const searchParams = new URLSearchParams({ orderNumber: normalizedOrderNumber })
  if (options.light) searchParams.set('light', 'true')

  const res = await fetch(`/api/orders?${searchParams.toString()}`, {
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Errore fetch ordine (${res.status})`)
  }

  const data = (await res.json()) as { order?: T }
  return data?.order ?? null
}

export function fetchPublicOrder(orderNumber: string) {
  return fetchOrderInternal<PublicOrder>(orderNumber, { light: false })
}

export function fetchPublicOrderLight(orderNumber: string) {
  return fetchOrderInternal<PublicOrderLight>(orderNumber, { light: true })
}
