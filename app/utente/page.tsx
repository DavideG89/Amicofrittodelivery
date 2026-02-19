'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Star, Trash2, Clock } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getStoredOrders, removeOrderFromDevice, type StoredOrder } from '@/lib/order-storage'

export default function UserPage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState('')
  const [storedOrders, setStoredOrders] = useState<StoredOrder[]>([])

  useEffect(() => {
    const orders = getStoredOrders()
    setStoredOrders(orders)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!orderNumber.trim()) return

    router.push(`/track/${orderNumber.trim()}`)
  }

  const handleRemoveOrder = (orderNum: string) => {
    removeOrderFromDevice(orderNum)
    setStoredOrders(getStoredOrders())
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6 sm:py-12 px-4 max-w-3xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full">
              <Star className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Utente Amico</h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            Inserisci il numero del tuo ordine per vedere lo stato in tempo reale
          </p>
        </div>

       
        {storedOrders.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                I miei ordini
              </CardTitle>
              <CardDescription>
                i tuoi ordini recenti (salvati su questo dispositivo)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {storedOrders.map((order) => (
                  <div
                    key={order.orderNumber}
                    className="flex items-center justify-between p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => router.push(`/track/${order.orderNumber}`)}
                      className="flex-1 text-left"
                      aria-label={`Visualizza ordine ${order.orderNumber}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="font-mono font-semibold text-sm sm:text-base">
                          {order.orderNumber}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {order.type === 'delivery' ? 'Consegna' : 'Ritiro'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOrder(order.orderNumber)}
                      aria-label={`Rimuovi ordine ${order.orderNumber}`}
                      className="ml-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Gli ordini vengono salvati solo su questo dispositivo per 30 giorni
              </p>
            </CardContent>
          </Card>
        )}
         <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cerca ordine</CardTitle>
            <CardDescription>
              Inserisci il numero ordine che hai ricevuto alla conferma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderNumber">Numero ordine</Label>
                <Input
                  id="orderNumber"
                  type="text"
                  placeholder="es: ORD-20240216-ABCD"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="text-base sm:text-lg font-mono"
                  required
                  aria-label="Numero ordine"
                />
              </div>

              <Button type="submit" className="w-full" size="lg">
                <Search className="mr-2 h-5 w-5" />
                Traccia ordine
              </Button>
            </form>
          </CardContent>
        </Card>


        <div className="p-4 bg-muted/50 rounded-lg border">
          <h3 className="font-semibold mb-2 text-sm">Hai bisogno di aiuto?</h3>
          <p className="text-sm text-muted-foreground">
            Se non trovi il numero ordine contattaci su WhatsApp:{' '}
            <a
              href="https://wa.me/393382012533"
              target="_blank"
              rel="noreferrer"
              className="font-mono font-semibold text-primary hover:underline"
            >
              338 201 2533
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
