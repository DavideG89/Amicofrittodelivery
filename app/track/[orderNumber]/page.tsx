'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, Package, Truck, ChefHat, CircleCheckBig, XCircle, RefreshCw, Utensils } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase, PublicOrder } from '@/lib/supabase'

const statusConfig = {
  pending: {
    label: 'In attesa',
    icon: Clock,
    color: 'bg-yellow-500',
    description: 'Il tuo ordine è stato ricevuto ed è in attesa di conferma'
  },
  confirmed: {
    label: 'Ordine confermato',
    icon: CheckCircle,
    color: 'bg-blue-500',
    description: 'Il tuo ordine è stato confermato e sarà presto in preparazione'
  },
  preparing: {
    label: 'Stiamo preparando',
    icon: ChefHat,
    color: 'bg-orange-500',
    description: 'Stiamo preparando il tuo ordine con cura'
  },
  ready: {
    label: 'In Consegna',
    icon: Utensils,
    color: 'bg-green-500',
    description: 'Il tuo ordine è pronto!'
  },
  completed: {
    label: 'Completato',
    icon: CircleCheckBig,
    color: 'bg-yellow-500',
    description: 'Ordine completato. Buon appetito!'
  },
  cancelled: {
    label: 'Annullato',
    icon: XCircle,
    color: 'bg-red-500',
    description: 'L\'ordine è stato annullato'
  }
}

export default function OrderTrackingDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const orderNumber = params.orderNumber as string
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!orderNumber) return
    try {
      localStorage.setItem('lastOrderNumber', orderNumber)
      localStorage.setItem('lastOrderActive', 'true')
    } catch {
      // ignore storage errors
    }
  }, [orderNumber])

  const fetchOrder = async (light = false) => {
    try {
      const { data, error } = await supabase
        .from('orders_public')
        .select(
          light
            ? 'order_number, status, updated_at'
            : 'order_number, status, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, created_at, updated_at'
        )
        .eq('order_number', orderNumber)
        .single()

      if (error) throw error
      
      setOrder((prev) =>
        light && prev
          ? { ...prev, status: data.status, updated_at: data.updated_at }
          : data
      )
      try {
        const active = data.status !== 'completed' && data.status !== 'cancelled'
        localStorage.setItem('lastOrderActive', active ? 'true' : 'false')
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.error('[v0] Error fetching order:', error)
      setOrder(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchOrder()

    // Auto-refresh every 60 seconds if order is not completed/cancelled
    const interval = setInterval(() => {
      if (order && order.status !== 'completed' && order.status !== 'cancelled') {
        fetchOrder(true)
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [orderNumber])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrder(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 max-w-3xl mx-auto flex flex-col justify-center min-h-[calc(100vh-5rem)] py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
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
        <main className="container py-8 px-4 max-w-3xl mx-auto">
          <Button variant="ghost" asChild className="mb-6 -ml-3">
            <Link href="/track">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna indietro
            </Link>
          </Button>
          
          <Card className="text-center py-12">
            <CardContent>
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Ordine non trovato</h2>
              <p className="text-muted-foreground mb-6">
                Non siamo riusciti a trovare un ordine con il numero: <span className="font-mono">{orderNumber}</span>
              </p>
              <Button asChild>
                <Link href="/track">
                  Riprova
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const currentStatus = statusConfig[order.status as keyof typeof statusConfig]
  const StatusIcon = currentStatus.icon
  const statusTimestamp = order.updated_at || order.created_at

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
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Aggiorna stato ordine"
            className="w-fit"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>
        
        {/*
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Attiva le notifiche dell’ordine</p>
              <p className="text-sm text-blue-800/80">
                Su iPhone funziona solo se installi l’app: Condividi → Aggiungi a Home.
              </p>
            </div>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
              href={`/order/${order.order_number}`}
            >
              Attiva notifiche
            </Link>
          </div>
        </div> */}

        {/* Order Header */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg sm:text-xl md:text-2xl truncate">
                    Ordine {order.order_number}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Stato aggiornato alle{' '}
                    {new Date(statusTimestamp).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                
                <Badge 
                  variant="outline" 
                  className={`${currentStatus.color} text-white border-none px-3 py-1.5 text-sm sm:text-base whitespace-nowrap`}
                >
                  {currentStatus.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg ${currentStatus.color} bg-opacity-10`}>
              <StatusIcon className={`h-6 w-6 sm:h-8 sm:w-8 ${currentStatus.color.replace('bg-', 'text-')} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base">{currentStatus.label}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {currentStatus.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Progress */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Stato ordine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['pending', 'confirmed', 'preparing', 'ready', order.order_type === 'delivery' ? 'out_for_delivery' : 'completed'].map((status, index, statuses) => {
                const config = status === 'out_for_delivery' 
                  ? { label: 'In consegna', icon: Truck, color: 'bg-indigo-500' }
                  : statusConfig[status as keyof typeof statusConfig]
                
                if (!config) return null
                
                const Icon = config.icon
                const currentIndex = statuses.indexOf(order.status)
                const isActive = index <= currentIndex || order.status === 'completed'
                const isCancelled = order.status === 'cancelled'
                
                return (
                  <div key={status} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`
                        rounded-full p-2 
                        ${isActive && !isCancelled ? config.color : 'bg-muted'}
                        ${isActive && !isCancelled ? 'text-white' : 'text-muted-foreground'}
                      `}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {index < statuses.length - 1 && (
                        <div className={`w-0.5 h-8 mt-2 ${isActive && !isCancelled ? config.color : 'bg-muted'}`} />
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <p className={`font-medium ${isActive && !isCancelled ? '' : 'text-muted-foreground'}`}>
                        {config.label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Dettagli ordine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo ordine</p>
                <p className="font-medium">
                  {order.order_type === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in negozio'}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Articoli</h4>
              <div className="space-y-2">
                {order.items.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="font-medium">{(item.price * item.quantity).toFixed(2)}€</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotale</span>
                <span>{order.subtotal.toFixed(2)}€</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Consegna</span>
                  <span>{order.delivery_fee.toFixed(2)}€</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Sconto</span>
                  <span>-{order.discount_amount.toFixed(2)}€</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Totale</span>
                <span>{order.total.toFixed(2)}€</span>
              </div>
            </div>

          </CardContent>
        </Card>

        <div className="text-center text-xs sm:text-sm text-muted-foreground mt-4">
          <p>La pagina si aggiorna automaticamente ogni 30 secondi</p>
        </div>
      </main>
    </div>
  )
}
