'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import {
  ArrowLeft,
  ChefHat,
  CircleCheckBig,
  Clock,
  Home,
  RefreshCw,
  Utensils,
  XCircle,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OrderStatus, PublicOrder } from '@/lib/supabase'

const LottiePlayer = 'lottie-player' as any

const statusConfig = {
  pending: {
    label: 'In attesa',
    icon: Clock,
    color: 'bg-yellow-500',
    description: "Il tuo ordine e' stato ricevuto ed e' in attesa.",
  },
  confirmed: {
    label: 'In preparazione',
    icon: ChefHat,
    color: 'bg-orange-500',
    description: 'Stiamo preparando il tuo ordine.',
  },
  preparing: {
    label: 'In preparazione',
    icon: ChefHat,
    color: 'bg-orange-500',
    description: 'Stiamo preparando il tuo ordine.',
  },
  ready: {
    label: 'In consegna',
    icon: Utensils,
    color: 'bg-indigo-600',
    description: "Il tuo ordine e' in consegna.",
  },
  completed: {
    label: 'Completato',
    icon: CircleCheckBig,
    color: 'bg-emerald-600',
    description: 'Ordine completato. Grazie!',
  },
  cancelled: {
    label: 'Annullato',
    icon: XCircle,
    color: 'bg-red-600',
    description: 'Ordine annullato.',
  },
} as const

const timelineStatuses = ['pending', 'preparing', 'ready', 'completed'] as const
const demoStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed']
const ORDER_TERMINAL_STATUS_EVENT = 'af:order-terminal-status'

const createdAt = new Date('2026-05-20T12:15:00+02:00').toISOString()

const demoOrderBase: Omit<PublicOrder, 'status' | 'updated_at'> = {
  order_number: 'DEMO-001',
  order_type: 'takeaway',
  payment_method: 'cash',
  items: [
    {
      product_id: 'demo-smash',
      name: 'Amico Burger',
      price: 8.5,
      quantity: 1,
      additions: 'Salse: Maionese',
      additions_unit_price: 0,
      additions_ids: [],
    },
    {
      product_id: 'demo-fritti',
      name: 'Patatine fritte',
      price: 3.5,
      quantity: 1,
      additions: null,
      additions_unit_price: 0,
      additions_ids: [],
    },
    {
      product_id: 'demo-drink',
      name: 'Coca-Cola',
      price: 2,
      quantity: 1,
      additions: null,
      additions_unit_price: 0,
      additions_ids: [],
    },
  ],
  subtotal: 14,
  discount_code: null,
  discount_amount: 0,
  delivery_fee: 0,
  total: 14,
  created_at: createdAt,
}

function getUserFacingStatus(status: OrderStatus): OrderStatus {
  return status === 'confirmed' ? 'preparing' : status
}

function getUpdatedAt(index: number) {
  return new Date(new Date(createdAt).getTime() + index * 5 * 60 * 1000).toISOString()
}

export default function DemoOrderPage() {
  const [statusIndex, setStatusIndex] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const status = demoStatuses[statusIndex] ?? 'pending'
  const order = useMemo<PublicOrder>(
    () => ({
      ...demoOrderBase,
      status,
      updated_at: getUpdatedAt(statusIndex),
    }),
    [status, statusIndex],
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatusIndex((current) => (current >= demoStatuses.length - 1 ? current : current + 1))
    }, 4500)

    return () => window.clearInterval(id)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    window.setTimeout(() => setRefreshing(false), 550)
  }

  const simulateTerminalStatus = (nextStatus: 'completed' | 'cancelled') => {
    window.sessionStorage.removeItem(`order-terminal-dialog:${demoOrderBase.order_number}:${nextStatus}`)
    window.dispatchEvent(
      new CustomEvent(ORDER_TERMINAL_STATUS_EVENT, {
        detail: { orderNumber: demoOrderBase.order_number, status: nextStatus },
      })
    )
  }

  const timelineStatus = getUserFacingStatus(order.status)
  const timelineCurrentIndex = timelineStatuses.indexOf(timelineStatus as (typeof timelineStatuses)[number])
  const currentStatus = statusConfig[timelineStatus as keyof typeof statusConfig] ?? statusConfig.pending
  const statusTimestamp = order.updated_at || order.created_at
  const showPreparingLottie = timelineStatus === 'preparing'
  const showDeliveryLottie = timelineStatus === 'ready'
  const statusLottieSrc = showPreparingLottie
    ? '/Hamburger%20Loading.json'
    : showDeliveryLottie
      ? '/Delivery%20Riding.json'
      : null

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <Script
        src="https://unpkg.com/@lottiefiles/lottie-player@2.0.12/dist/lottie-player.js"
        strategy="afterInteractive"
      />
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-4 sm:py-8">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:mb-6 sm:flex-row sm:items-center">
          <Button variant="ghost" asChild className="-ml-3 hidden w-fit md:inline-flex">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna in Home
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="w-fit">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>

        <Card className="mb-4 border-dashed border-primary/40 sm:mb-6">
          <CardHeader>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex shrink-0 flex-col items-center gap-1">
                {statusLottieSrc && (
                  <LottiePlayer
                    key={statusLottieSrc}
                    src={statusLottieSrc}
                    background="transparent"
                    speed="1"
                    loop
                    autoplay
                    className="h-[80px] w-[80px] scale-[1.65] [transform-origin:center]"
                  />
                )}
                <Badge className={`${currentStatus.color} border-none text-white`}>{currentStatus.label}</Badge>
              </div>
              <div className="min-w-0">
                <div className="mb-2">
                  <Badge variant="outline">Demo</Badge>
                </div>
                <CardTitle className="truncate text-xl sm:text-2xl">Ordine {order.order_number}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
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
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">{currentStatus.description}</p>
          </CardContent>
        </Card>

        {process.env.NODE_ENV === 'development' && (
          <Card className="mb-4 border-dashed sm:mb-6">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Test Drawer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => simulateTerminalStatus('completed')}>
                Simula completato
              </Button>
              <Button type="button" variant="outline" onClick={() => simulateTerminalStatus('cancelled')}>
                Simula annullato
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Stato ordine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timelineStatuses.map((itemStatus, index) => {
                const config = statusConfig[itemStatus]
                const Icon = config.icon
                const isDone = index <= timelineCurrentIndex
                return (
                  <div key={itemStatus} className="flex items-start gap-4">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Tipo ordine</p>
                <p className="font-medium">Ritiro in negozio</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pagamento</p>
                <p className="font-medium">Contanti</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="mb-3 font-semibold">Articoli</h4>
              <div className="space-y-2">
                {order.items.map((item, index) => (
                  <div key={`${item.product_id}-${index}`} className="flex justify-between gap-3 text-sm">
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

            <div className="space-y-1 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Subtotale</span>
                <span>{order.subtotal.toFixed(2)} euro</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>Totale</span>
                <span>{order.total.toFixed(2)} euro</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground sm:text-sm">Aggiornamento automatico ogni pochi secondi.</p>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur md:hidden">
        <Button asChild variant="ghost" className="w-full border-0 bg-white/50 text-black shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-sm hover:bg-white/60 hover:text-black">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            Torna in Home
          </Link>
        </Button>
      </div>
    </div>
  )
}
