'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase, type Order } from '@/lib/supabase'
import { toast } from 'sonner'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const normalizeItems = (items: Order['items']) =>
  items.map((item) => ({
    ...item,
    price: toNumber(item.price),
    quantity: toNumber(item.quantity, 1),
    additions_unit_price: toNumber(item.additions_unit_price),
  }))

const toItems = (value: unknown): Order['items'] => {
  if (Array.isArray(value)) return normalizeItems(value as Order['items'])
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? normalizeItems(parsed as Order['items']) : []
    } catch {
      return []
    }
  }
  return []
}

const normalizeOrder = (order: Order): Order => ({
  ...order,
  items: toItems(order.items),
  subtotal: toNumber(order.subtotal),
  discount_amount: toNumber(order.discount_amount),
  delivery_fee: toNumber(order.delivery_fee),
  total: toNumber(order.total),
})

type StoreInfoPreview = {
  name: string
  phone?: string | null
  address?: string | null
}

export default function OrderPrintPreviewPage() {
  const params = useParams<{ orderId?: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const orderId = typeof params?.orderId === 'string' ? params.orderId : ''
  const returnToRaw = searchParams.get('returnTo') || '/admin/dashboard/orders'
  const safeReturnTo = returnToRaw.startsWith('/admin/dashboard/orders')
    ? returnToRaw
    : '/admin/dashboard/orders'

  const [loading, setLoading] = useState(true)
  const [queueLoading, setQueueLoading] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [storeInfo, setStoreInfo] = useState<StoreInfoPreview | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!UUID_PATTERN.test(orderId)) {
        setLoading(false)
        setOrder(null)
        return
      }

      try {
        const [{ data: orderData, error: orderError }, { data: storeData }] = await Promise.all([
          supabase
            .from('orders')
            .select(
              'id, order_number, customer_name, customer_phone, customer_address, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, status, notes, created_at, updated_at'
            )
            .eq('id', orderId)
            .maybeSingle(),
          supabase.from('store_info').select('name, phone, address').limit(1).maybeSingle(),
        ])

        if (orderError || !orderData) {
          setOrder(null)
          return
        }

        setOrder(normalizeOrder(orderData as Order))
        setStoreInfo((storeData as StoreInfoPreview | null) ?? null)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [orderId])

  const handleQueuePrint = async () => {
    if (!order) return
    setQueueLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sessione admin non valida')

      const res = await fetch('/api/admin/print-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId: order.id, triggerStatus: 'manual_preview' }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Errore coda stampa')
      }

      toast.success('Comanda accodata per la stampante')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore coda stampa'
      toast.error(message)
    } finally {
      setQueueLoading(false)
    }
  }

  const orderTypeLabel = useMemo(() => {
    if (!order) return ''
    return order.order_type === 'delivery' ? 'DOMICILIO' : 'ASPORTO'
  }, [order])

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento anteprima...
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 space-y-4 text-center">
            <p className="text-muted-foreground">Ordine non trovato</p>
            <Button onClick={() => router.push('/admin/dashboard/orders')}>Torna agli ordini</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 print:bg-white print:p-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" onClick={() => router.push(safeReturnTo)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna all&apos;ordine
        </Button>
        <Button variant="outline" onClick={handleQueuePrint} disabled={queueLoading}>
          {queueLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Invia a coda stampante
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Stampa
        </Button>
      </div>

      <div className="mx-auto w-full max-w-[360px] rounded border bg-white p-4 text-black shadow print:mx-0 print:w-[80mm] print:max-w-[80mm] print:rounded-none print:border-0 print:p-[3mm] print:shadow-none">
        <div className="border-b-2 border-dashed pb-3 text-center">
          <h1 className="text-2xl font-bold">{storeInfo?.name || 'AMICO FRITTO'}</h1>
          {storeInfo?.address ? <p className="text-sm">{storeInfo.address}</p> : null}
          {storeInfo?.phone ? <p className="text-sm">Tel: {storeInfo.phone}</p> : null}
        </div>

        <div className="my-3 border-b border-dashed pb-3 text-sm">
          <p>
            <strong>COMANDA:</strong> #{order.order_number}
          </p>
          <p>
            <strong>Data:</strong> {new Date(order.created_at).toLocaleString('it-IT')}
          </p>
        </div>

        <div className="my-3 bg-black py-1 text-center text-sm font-bold text-white">{orderTypeLabel}</div>

        <div className="my-3 space-y-1 text-sm">
          <p>
            <strong>Cliente:</strong> {order.customer_name}
          </p>
          <p>
            <strong>Tel:</strong> {order.customer_phone}
          </p>
          {order.customer_address && order.order_type === 'delivery' ? (
            <p>
              <strong>Indirizzo:</strong> {order.customer_address}
            </p>
          ) : null}
          {order.payment_method ? (
            <p>
              <strong>Pagamento:</strong> {order.payment_method === 'card' ? 'Carta (POS)' : 'Contanti'}
            </p>
          ) : null}
        </div>

        <div className="my-3 space-y-2 text-sm">
          {order.items.map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="flex items-start justify-between gap-2 border-b pb-2">
              <div>
                <p>
                  {item.quantity}x {item.name}
                </p>
                {item.additions_unit_price && item.additions_unit_price > 0 ? (
                  <p className="text-xs text-slate-600">+ Extra: {item.additions_unit_price.toFixed(2)}€ cad.</p>
                ) : null}
                {item.additions ? <p className="text-xs text-slate-600">+ {item.additions}</p> : null}
              </div>
              <p>{(item.price + (item.additions_unit_price || 0)).toFixed(2)}€</p>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-dashed pt-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotale:</span>
            <span>{order.subtotal.toFixed(2)}€</span>
          </div>
          {order.discount_amount > 0 ? (
            <div className="flex justify-between">
              <span>Sconto ({order.discount_code || '-'})</span>
              <span>-{order.discount_amount.toFixed(2)}€</span>
            </div>
          ) : null}
          {order.delivery_fee > 0 ? (
            <div className="flex justify-between">
              <span>Consegna:</span>
              <span>{order.delivery_fee.toFixed(2)}€</span>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t-2 border-black pt-2 text-base font-bold">
            <span>TOTALE:</span>
            <span>{order.total.toFixed(2)}€</span>
          </div>
        </div>

        {order.notes ? (
          <div className="mt-3 border-t border-dashed pt-3 text-sm">
            <strong>Note:</strong>
            <p>{order.notes}</p>
          </div>
        ) : null}

        <div className="mt-4 border-t-2 border-dashed pt-3 text-center text-xs">
          <p>Grazie per il tuo ordine!</p>
          <p className="mt-1">Anteprima stampata il: {new Date().toLocaleString('it-IT')}</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
