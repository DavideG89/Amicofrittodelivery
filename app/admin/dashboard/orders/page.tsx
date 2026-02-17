'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, CheckCircle, XCircle, Package, Truck, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Order } from '@/lib/supabase'
import { printReceipt } from '@/lib/print-receipt'
import { toast } from 'sonner'

const statusConfig = {
  pending: { label: 'In attesa', icon: Clock, variant: 'secondary' as const },
  confirmed: { label: 'Confermato', icon: CheckCircle, variant: 'default' as const },
  preparing: { label: 'In preparazione', icon: Package, variant: 'default' as const },
  ready: { label: 'Pronto', icon: Truck, variant: 'default' as const },
  completed: { label: 'Completato', icon: CheckCircle, variant: 'default' as const },
  cancelled: { label: 'Annullato', icon: XCircle, variant: 'destructive' as const }
}

export default function OrdersManagementPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [storeInfo, setStoreInfo] = useState<{ name: string; phone?: string | null; address?: string | null } | null>(null)

  useEffect(() => {
    fetchOrders()
    fetchStoreInfo()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchStoreInfo() {
    const { data } = await supabase
      .from('store_info')
      .select('name, phone, address')
      .limit(1)
      .maybeSingle()
    
    if (data) {
      setStoreInfo(data)
    }
  }

  async function fetchOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setOrders(data || [])
    } catch (error) {
      console.error('[v0] Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)

      if (error) throw error
      toast.success('Stato aggiornato')
      fetchOrders()
      
      // Update selected order if it's open
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus })
      }
    } catch (error) {
      console.error('[v0] Error updating status:', error)
      toast.error('Errore durante l\'aggiornamento')
    }
  }

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order)
    setDetailsOpen(true)
  }

  const filterOrdersByStatus = (status?: Order['status']) => {
    if (!status) return orders
    return orders.filter(order => order.status === status)
  }

  const OrderCard = ({ order }: { order: Order }) => {
    const config = statusConfig[order.status]
    const Icon = config.icon

    return (
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewDetails(order)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-lg">{order.order_number}</h3>
              <p className="text-sm text-muted-foreground">
                {format(new Date(order.created_at), 'PPp', { locale: it })}
              </p>
            </div>
            <Badge variant={config.variant}>
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>

          <div className="space-y-1 text-sm mb-3">
            <p><span className="font-medium">Cliente:</span> {order.customer_name}</p>
            <p><span className="font-medium">Telefono:</span> {order.customer_phone}</p>
            <div>
              <span className="font-medium">Tipo:</span>{' '}
              {order.order_type === 'delivery' ? (
                <Badge variant="outline">Consegna</Badge>
              ) : (
                <Badge variant="outline">Ritiro</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-sm text-muted-foreground">
              {order.items.length} articoli
            </span>
            <span className="font-bold text-lg">{order.total.toFixed(2)}€</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return <div className="p-6">Caricamento...</div>
  }

  const pendingOrders = filterOrdersByStatus('pending')
  const activeOrders = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status))
  const completedOrders = filterOrdersByStatus('completed')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gestione Ordini</h1>
        <p className="text-muted-foreground">Visualizza e gestisci gli ordini in tempo reale</p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            In attesa ({pendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="active">
            Attivi ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completati ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            Tutti ({orders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {pendingOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nessun ordine in attesa</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nessun ordine attivo</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {completedOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nessun ordine completato</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Order Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Ordine {selectedOrder.order_number}</DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedOrder.created_at), 'PPpp', { locale: it })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Stato ordine</h3>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={(value) => handleStatusChange(selectedOrder.id, value as Order['status'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Informazioni cliente</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium">{selectedOrder.customer_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefono:</span>
                      <span className="font-medium">{selectedOrder.customer_phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="font-medium">
                        {selectedOrder.order_type === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in negozio'}
                      </span>
                    </div>
                    {selectedOrder.customer_address && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Indirizzo:</span>
                        <span className="font-medium text-right">{selectedOrder.customer_address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Articoli ordinati</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm py-2 border-b">
                        <div>
                          <span className="font-medium">{item.quantity}x</span> {item.name}
                          <div className="text-xs text-muted-foreground">{item.price.toFixed(2)}€ cad.</div>
                        </div>
                        <span className="font-medium">{(item.price * item.quantity).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Riepilogo</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotale:</span>
                      <span>{selectedOrder.subtotal.toFixed(2)}€</span>
                    </div>
                    {selectedOrder.delivery_fee > 0 && (
                      <div className="flex justify-between">
                        <span>Consegna:</span>
                        <span>{selectedOrder.delivery_fee.toFixed(2)}€</span>
                      </div>
                    )}
                    {selectedOrder.discount_amount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Sconto ({selectedOrder.discount_code}):</span>
                        <span>-{selectedOrder.discount_amount.toFixed(2)}€</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Totale:</span>
                      <span>{selectedOrder.total.toFixed(2)}€</span>
                    </div>
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div>
                    <h3 className="font-semibold mb-2">Note:</h3>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Chiudi
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => printReceipt(selectedOrder, storeInfo || undefined)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Stampa
                  </Button>
                  {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const nextStatus: Record<string, Order['status']> = {
                          pending: 'confirmed',
                          confirmed: 'preparing',
                          preparing: 'ready',
                          ready: 'completed'
                        }
                        const next = nextStatus[selectedOrder.status]
                        if (next) {
                          handleStatusChange(selectedOrder.id, next)
                        }
                      }}
                    >
                      {selectedOrder.status === 'pending' && 'Conferma ordine'}
                      {selectedOrder.status === 'confirmed' && 'Inizia preparazione'}
                      {selectedOrder.status === 'preparing' && 'Segna come pronto'}
                      {selectedOrder.status === 'ready' && 'Completa ordine'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
