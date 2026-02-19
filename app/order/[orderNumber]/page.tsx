'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Home, Loader2, Package, Clock, Copy, Check, Bookmark, MapPin, Phone, User } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { supabase, Order } from '@/lib/supabase'
import { saveOrderToDevice } from '@/lib/order-storage'
import { toast } from 'sonner'

export default function OrderPage() {
  const params = useParams()
  const router = useRouter()
  const orderNumber = params.orderNumber as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [savedLink, setSavedLink] = useState(false)

  useEffect(() => {
    async function fetchOrder() {
      if (!orderNumber) {
        toast.error('Numero ordine non trovato')
        router.push('/')
        return
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single()

      if (error || !data) {
        toast.error('Ordine non trovato')
        setLoading(false)
        return
      }

      setOrder(data)
      saveOrderToDevice(data.order_number, data.order_type)
      setLoading(false)
    }

    fetchOrder()
  }, [orderNumber, router])

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(orderNumber)
      setCopied(true)
      toast.success('Codice copiato negli appunti')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('Impossibile copiare il codice')
    }
  }

  const handleSaveLink = async () => {
    const url = `${window.location.origin}/order/${orderNumber}`
    try {
      await navigator.clipboard.writeText(url)
      setSavedLink(true)
      toast.success('Link ordine salvato negli appunti')
    } catch (err) {
      toast.error('Impossibile salvare il link ordine')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-12 px-4 max-w-2xl mx-auto">
          <Card className="border-2 border-primary shadow-lg">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
        <main className="container py-12 px-4 max-w-2xl mx-auto">
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

  const statusMap = {
    pending: { label: 'In attesa di conferma', emoji: '⏳', color: 'bg-yellow-500' },
    confirmed: { label: 'Confermato', emoji: '✅', color: 'bg-blue-500' },
    preparing: { label: 'In preparazione', emoji: '🍳', color: 'bg-orange-500' },
    ready: { label: 'Pronto', emoji: '🎉', color: 'bg-green-500' },
    completed: { label: 'Completato', emoji: '✓', color: 'bg-gray-500' }
  }

  const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap.pending
  const estimatedTime = order.order_type === 'delivery' ? '30-45 min' : '15-25 min'

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6 sm:py-12 px-4 max-w-2xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-green-500/10 p-4 rounded-full">
              <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-500" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Ordine ricevuto ✅
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Grazie per il tuo ordine!
          </p>
        </div>

        {/* Order Number Card */}
        <Card className="mb-4 sm:mb-6 border-2 border-primary">
          <CardContent className="py-6">
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground mb-2">Clicca per copiare il Codice</p>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 focus:outline-none focus:ring-2 focus:ring-primary/60 rounded-md px-2 -mx-2"
              >
                #{order.order_number}
              </button>
              <div className="flex justify-center">
                <Badge className={`${currentStatus.color} text-white border-none px-4 py-2 text-base`}>
                  <span className="mr-2">{currentStatus.emoji}</span>
                  {currentStatus.label}
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tempo stimato</p>
                  <p className="font-semibold text-lg">{estimatedTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tipo ordine</p>
                  <p className="font-semibold text-lg">
                    {order.order_type === 'delivery' ? 'Consegna' : 'Ritiro'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <Button
                onClick={handleSaveLink}
                variant="ghost"
                className="h-auto w-full flex-col gap-1 py-3 text-xs text-green-600"
              >
                <Bookmark className={`h-5 w-5 ${savedLink ? 'text-green-600 fill-green-600' : 'text-green-600'}`} />
                Salva link ordine
              </Button>

              <Button asChild className="h-auto w-full flex-col gap-1 py-3 text-xs">
                <Link href={`/track/${order.order_number}`}>
                  <Package className="h-5 w-5" />
                  Traccia ordine
                </Link>
              </Button>

              <Button asChild variant="ghost" className="h-auto w-full flex-col gap-1 py-3 text-xs border-0">
                <Link href="/">
                  <Home className="h-5 w-5" />
                  Torna alla home
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Order Details Card */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Riepilogo ordine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{order.customer_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{order.customer_phone}</span>
              </div>
              {order.customer_address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{order.customer_address}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-3">
              {order.items && Array.isArray(order.items) && order.items.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Quantità: {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">
                    €{(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotale</span>
                <span>€{order.subtotal.toFixed(2)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Sconto {order.discount_code && `(${order.discount_code})`}</span>
                  <span>-€{order.discount_amount.toFixed(2)}</span>
                </div>
              )}
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Costo consegna</span>
                  <span>€{order.delivery_fee.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Totale</span>
                <span>€{order.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  )
}
