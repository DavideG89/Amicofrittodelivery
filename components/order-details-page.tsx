'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CircleCheckBig, Clock, Home, Loader2, RefreshCw, Utensils, XCircle, ChefHat } from 'lucide-react'
import { Header } from '@/components/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase, PublicOrder } from '@/lib/supabase'
import { saveOrderToDevice } from '@/lib/order-storage'
import { normalizeOrderNumber } from '@/lib/order-number'
import type { OrderStatus } from '@/lib/supabase'

const statusConfig = {
  pending: {
    label: 'In attesa',
    icon: Clock,
    color: 'bg-yellow-500',
    description: "Il tuo ordine e' stato ricevuto ed e' in attesa."
  },
  confirmed: {
    label: 'In preparazione',
    icon: ChefHat,
    color: 'bg-orange-500',
    description: 'Stiamo preparando il tuo ordine.'
  },
  preparing: {
    label: 'In preparazione',
    icon: ChefHat,
    color: 'bg-orange-500',
    description: 'Stiamo preparando il tuo ordine.'
  },
  ready: {
    label: 'In consegna',
    icon: Utensils,
    color: 'bg-indigo-600',
    description: "Il tuo ordine e' in consegna."
  },
  completed: {
    label: 'Completato',
    icon: CircleCheckBig,
    color: 'bg-emerald-600',
    description: 'Ordine completato. Grazie!'
  },
  cancelled: {
    label: 'Annullato',
    icon: XCircle,
    color: 'bg-red-600',
    description: 'Ordine annullato.'
  }
} as const

const timelineStatuses = ['pending', 'preparing', 'ready', 'completed'] as const

export function OrderDetailsPage() {
  const params = useParams()
  const orderNumber = normalizeOrderNumber(params.orderNumber)
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollingIntervalMs = 10000

  const updateOrderContext = (number: string, status: string) => {
    try {
      localStorage.setItem('lastOrderNumber', number)
      const active = status !== 'completed' && status !== 'cancelled'
      localStorage.setItem('lastOrderActive', active ? 'true' : 'false')
    } catch {
      // ignore storage errors
    }
  }

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  const fetchOrder = async (light = false) => {
    try {
      if (!orderNumber) {
        if (!light) setOrder(null)
        return
      }

      if (light) {
        const { data, error } = await supabase
          .from('orders_public')
          .select('order_number, status, updated_at')
          .eq('order_number', orderNumber)
          .maybeSingle()

        if (error || !data) throw error ?? new Error('Order not found')

        setOrder((prev) => (prev ? { ...prev, status: data.status, updated_at: data.updated_at } : prev))
        updateOrderContext(data.order_number, data.status)
        return
      }

      const maxAttempts = 3
      let data: PublicOrder | null = null
      let error: unknown = null
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await supabase
          .from('orders_public')
          .select('order_number, status, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, created_at, updated_at')
          .eq('order_number', orderNumber)
          .maybeSingle()

        data = (result.data as PublicOrder | null) ?? null
        error = result.error

        if (error) break
        if (data) break
        if (attempt < maxAttempts) {
          await wait(attempt * 700)
        }
      }

      if (error || !data) throw error ?? new Error('Order not found')

      setOrder(data)
      saveOrderToDevice(data.order_number, data.order_type)
      updateOrderContext(data.order_number, data.status)
    } catch {
      if (!light) {
        setOrder(null)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchOrder()
  }, [orderNumber])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (order && order.status !== 'completed' && order.status !== 'cancelled') {
        fetchOrder(true)
      } else if (!order) {
        fetchOrder()
      }
    }, pollingIntervalMs)
    return () => window.clearInterval(id)
  }, [order, orderNumber])

  useEffect(() => {
    const refreshOnForeground = () => {
      if (document.visibilityState === 'hidden') return
      if (order && order.status !== 'completed' && order.status !== 'cancelled') {
        void fetchOrder(true)
      } else {
        void fetchOrder()
      }
    }

    window.addEventListener('focus', refreshOnForeground)
    document.addEventListener('visibilitychange', refreshOnForeground)
    return () => {
      window.removeEventListener('focus', refreshOnForeground)
      document.removeEventListener('visibilitychange', refreshOnForeground)
    }
  }, [order, orderNumber])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrder(true)
  }

  const currentStatus = useMemo(() => {
    if (!order) return statusConfig.pending
    const normalizedStatus = getUserFacingStatus(order.status as OrderStatus)
    return statusConfig[normalizedStatus as keyof typeof statusConfig] ?? statusConfig.pending
  }, [order])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 max-w-3xl mx-auto py-12">
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Caricamento ordine...</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 max-w-3xl mx-auto py-12">
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground mb-4">Ordine non trovato</p>
              <Button asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Torna alla home
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const statusTimestamp = order.updated_at || order.created_at
  const timelineStatus = getUserFacingStatus(order.status as OrderStatus)
  const timelineCurrentIndex = timelineStatuses.indexOf(timelineStatus as (typeof timelineStatuses)[number])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-4 sm:py-8 px-4 max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <Button variant="ghost" asChild className="-ml-3 w-fit">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna in Home
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="w-fit">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>

        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-xl sm:text-2xl truncate">Ordine {order.order_number}</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Aggiornato il{' '}
                  {new Date(statusTimestamp).toLocaleDateString('it-IT', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <Badge className={`${currentStatus.color} text-white border-none`}>{currentStatus.label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{currentStatus.description}</p>
          </CardContent>
        </Card>

        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Stato ordine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timelineStatuses.map((status, index) => {
                const config = statusConfig[status]
                const Icon = config.icon
                const isCancelled = order.status === 'cancelled'
                const isDone = !isCancelled && index <= timelineCurrentIndex
                return (
                  <div key={status} className="flex items-start gap-4">
                    <div className={`rounded-full p-2 ${isDone ? config.color : 'bg-muted'} ${isDone ? 'text-white' : 'text-muted-foreground'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${isDone ? '' : 'text-muted-foreground'}`}>{config.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Dettagli ordine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo ordine</p>
                <p className="font-medium">{order.order_type === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in negozio'}</p>
              </div>
              {order.payment_method && (
                <div>
                  <p className="text-sm text-muted-foreground">Pagamento</p>
                  <p className="font-medium">{order.payment_method === 'cash' ? 'Contanti' : 'Carta (POS)'}</p>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Articoli</h4>
              <div className="space-y-2">
                {order.items.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between gap-3 text-sm">
                    <span>
                      {item.quantity}x {item.name}
                      {Number(item.additions_unit_price || 0) > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          Extra: +{Number(item.additions_unit_price).toFixed(2)} euro cad.
                        </span>
                      )}
                      {item.additions && <span className="block text-xs text-muted-foreground">Aggiunte: {item.additions}</span>}
                    </span>
                    <span className="font-medium">
                      {((Number(item.price || 0) + Number(item.additions_unit_price || 0)) * Number(item.quantity || 0)).toFixed(2)} euro
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotale</span>
                <span>{order.subtotal.toFixed(2)} euro</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Consegna</span>
                  <span>{order.delivery_fee.toFixed(2)} euro</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Sconto {order.discount_code ? `(${order.discount_code})` : ''}</span>
                  <span>-{order.discount_amount.toFixed(2)} euro</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Totale</span>
                <span>{order.total.toFixed(2)} euro</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs sm:text-sm text-muted-foreground">Aggiornamento automatico ogni 10 secondi.</p>
      </main>

    </div>
  )
}
  const getUserFacingStatus = (status: OrderStatus): OrderStatus =>
    status === 'confirmed' ? 'preparing' : status
