'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Home, Loader2, Package, Clock, Copy, Check, Bookmark } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase, PublicOrder } from '@/lib/supabase'
import { saveOrderToDevice } from '@/lib/order-storage'
import { normalizeOrderNumber } from '@/lib/order-number'
import { toast } from 'sonner'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

function OrderConfirmationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderNumber = normalizeOrderNumber(searchParams.get('orderNumber'))
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function fetchOrder() {
      if (!orderNumber) {
        toast.error('Numero ordine non trovato')
        setTimeout(() => router.push('/'), 2000)
        setLoading(false)
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
        if (error || data) break
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, attempt * 700))
        }
      }

      if (error) {
        toast.error('Errore nel caricamento dell\'ordine')
        setLoading(false)
        return
      }

      if (data) {
        setOrder(data)
        // Salva l'ordine sul dispositivo
        saveOrderToDevice(data.order_number, data.order_type)
        try {
          localStorage.setItem('lastOrderNumber', data.order_number)
          const active = data.status !== 'completed' && data.status !== 'cancelled'
          localStorage.setItem('lastOrderActive', active ? 'true' : 'false')
        } catch {
          // ignore storage errors
        }
      } else {
        toast.error('Ordine non trovato')
      }
      setLoading(false)
    }

    fetchOrder()
  }, [orderNumber, router])

  const handleCopyLink = () => {
    if (!order) return
    const link = `${window.location.origin}/order/${encodeURIComponent(order.order_number)}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Link copiato negli appunti!')
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confermato'
      case 'preparing':
        return 'In preparazione'
      case 'ready':
        return 'Pronto'
      case 'completed':
        return 'Completato'
      case 'cancelled':
        return 'Annullato'
      default:
        return 'Ricevuto'
    }
  }

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '✅'
      case 'preparing':
        return '🍳'
      case 'ready':
        return '📦'
      case 'completed':
        return '🎉'
      case 'cancelled':
        return '❌'
      default:
        return '📋'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-12 px-4 max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Caricamento ordine...</p>
          </div>
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
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-muted-foreground">Ordine non trovato</p>
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

  const estimatedTime = order.order_type === 'delivery' ? '30-45 min' : '15-25 min'

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6 sm:py-12 px-4 max-w-2xl mx-auto">
        {/* Titolo - Ordine ricevuto ✅ */}
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

        {/* Codice - Ordine #xxxx */}
        <Card className="mb-4 border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg text-center text-muted-foreground">
              Codice Ordine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold font-mono tracking-wider bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                #{order.order_number}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stato - In preparazione 🍳 */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Stato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label="stato ordine">
                {getStatusEmoji(order.status)}
              </span>
              <Badge variant="outline" className="bg-primary text-primary-foreground border-none text-base px-4 py-2">
                {getStatusLabel(order.status)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Info - Tempo stimato: XX min */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Informazioni
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tempo stimato:</span>
              <span className="font-bold text-lg">{estimatedTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tipo ordine:</span>
              <Badge variant="outline">
                {order.order_type === 'delivery' ? 'Consegna' : 'Ritiro'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Totale:</span>
              <span className="font-bold text-lg">€{order.total.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Azioni */}
        <div className="space-y-3">
          {/* 📋 Copia link ordine */}
          <Button 
            variant="outline" 
            className="w-full" 
            size="lg"
            onClick={handleCopyLink}
            aria-label="Copia link per tracciare l'ordine"
          >
            {copied ? (
              <>
                <Check className="mr-2 h-5 w-5 text-green-500" />
                Link copiato!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-5 w-5" />
                📋 Copia link ordine
              </>
            )}
          </Button>

          {/* Traccia ordine */}
          <Button asChild className="w-full" size="lg">
            <Link href={`/order/${encodeURIComponent(order.order_number)}`}>
              <Package className="mr-2 h-5 w-5" />
              Traccia il tuo ordine
            </Link>
          </Button>

          {/* Apri nella PWA */}
          <Button asChild variant="secondary" className="w-full" size="lg">
            <Link href={`/order/${encodeURIComponent(order.order_number)}`}>
              Apri nella PWA
            </Link>
          </Button>

          {/* 📌 Ordine salvato su questo dispositivo */}
          <div className="flex items-center justify-center gap-2 p-3 bg-muted/50 rounded-lg border text-sm text-muted-foreground">
            <Bookmark className="h-4 w-4" />
            <span>📌 Ordine salvato su questo dispositivo</span>
          </div>

          {/* Torna alla home */}
          <Button asChild variant="ghost" className="w-full" size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Torna alla home
            </Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 sm:py-12 px-4 max-w-2xl mx-auto">
          <Card className="border-2 border-primary shadow-lg">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Caricamento ordine...</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    }>
      <OrderConfirmationContent />
    </Suspense>
  )
}
