'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, CheckCircle, XCircle, Package, Truck, Printer, X, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Order } from '@/lib/supabase'
import { printReceipt } from '@/lib/print-receipt'
import { toast } from 'sonner'
import { useIsMobile } from '@/components/ui/use-mobile'

const statusConfig = {
  pending: { label: 'In attesa', icon: Clock, variant: 'secondary' as const },
  confirmed: { label: 'Confermato', icon: CheckCircle, variant: 'default' as const },
  preparing: { label: 'In preparazione', icon: Package, variant: 'default' as const },
  ready: { label: 'Pronto', icon: Truck, variant: 'default' as const },
  completed: { label: 'Completato', icon: CheckCircle, variant: 'default' as const },
  cancelled: { label: 'Annullato', icon: XCircle, variant: 'destructive' as const }
}

const statusOrder: Order['status'][] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']

const getStatusOptions = (current: Order['status']) => {
  if (current === 'ready') {
    return ['ready', 'completed', 'cancelled']
  }
  return statusOrder
}

const getNextStatus = (current: Order['status']): Order['status'] | null => {
  const nextStatus: Record<Order['status'], Order['status'] | null> = {
    pending: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'completed',
    completed: null,
    cancelled: null
  }

  return nextStatus[current] ?? null
}

const getNextStatusLabel = (current: Order['status']) => {
  const next = getNextStatus(current)
  if (!next) return 'Aggiorna stato'
  return statusConfig[next].label === 'Completato' ? 'Completa ordine' : statusConfig[next].label === 'In preparazione'
    ? 'Inizia preparazione'
    : statusConfig[next].label === 'Confermato'
      ? 'Conferma ordine'
      : statusConfig[next].label === 'Pronto'
        ? 'Segna come pronto'
        : `Passa a ${statusConfig[next].label.toLowerCase()}`
}

export default function OrdersManagementPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [storeInfo, setStoreInfo] = useState<{ name: string; phone?: string | null; address?: string | null } | null>(null)
  const isMobile = useIsMobile()

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
    const paymentLabel = order.payment_method === 'card' ? 'Carta (POS)' : order.payment_method === 'cash' ? 'Contanti' : null

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
            {order.order_type === 'delivery' && paymentLabel && (
              <div>
                <span className="font-medium">Pagamento:</span>{' '}
                <Badge variant="outline">{paymentLabel}</Badge>
              </div>
            )}
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
  const activeOrders = orders.filter(o => ['confirmed', 'preparing'].includes(o.status))
  const deliveryOrders = orders.filter(o => o.status === 'ready')
  const completedOrders = filterOrdersByStatus('completed')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gestione Ordini</h1>
        <p className="text-muted-foreground">Visualizza e gestisci gli ordini in tempo reale</p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b">
          <div className="overflow-x-auto -mx-6 px-6">
            <TabsList className="inline-flex w-max min-w-max justify-start gap-2 bg-muted/60">
            <TabsTrigger value="pending">
              In attesa ({pendingOrders.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Attivi ({activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="delivery">
              In consegna ({deliveryOrders.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completati ({completedOrders.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              Tutti ({orders.length})
            </TabsTrigger>
            </TabsList>
          </div>
        </div>

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

        <TabsContent value="delivery" className="mt-6">
          {deliveryOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nessun ordine in consegna</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deliveryOrders.map(order => (
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

      {/* Order Details Dialog / Sheet */}
      {isMobile ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 pt-0 [&>button]:hidden">
            {selectedOrder && (
              <>
                <div className="-mx-4 px-4 pt-4 pb-4 sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                  <SheetHeader>
                    <div className="flex items-start justify-between gap-4">
                      <SheetTitle>Ordine n° {selectedOrder.order_number}</SheetTitle>
                      <SheetClose className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <span className="sr-only">Chiudi</span>
                        <X className="h-4 w-4" />
                      </SheetClose>
                    </div>
                    <SheetDescription>
                      {format(new Date(selectedOrder.created_at), 'PPpp', { locale: it })}
                    </SheetDescription>
                  </SheetHeader>
                </div>

                <div className="space-y-6 pt-4 pb-24">
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
                      {selectedOrder.order_type === 'delivery' && selectedOrder.payment_method && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pagamento:</span>
                          <span className="font-medium">
                            {selectedOrder.payment_method === 'card' ? 'Carta (POS)' : 'Contanti'}
                          </span>
                        </div>
                      )}
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

                  <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => printReceipt(selectedOrder, storeInfo || undefined)}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Stampa
                      </Button>
                      {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                        <div className="flex flex-1 gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => {
                              const next = getNextStatus(selectedOrder.status)
                              if (next) {
                                handleStatusChange(selectedOrder.id, next)
                              }
                            }}
                          >
                            {getNextStatusLabel(selectedOrder.status)}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" aria-label="Cambia stato ordine">
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="end">
                              {getStatusOptions(selectedOrder.status).map((key) => (
                                <DropdownMenuItem
                                  key={key}
                                  onClick={() => handleStatusChange(selectedOrder.id, key)}
                                >
                                  {statusConfig[key].label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      ) : (
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
                      {selectedOrder.order_type === 'delivery' && selectedOrder.payment_method && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pagamento:</span>
                          <span className="font-medium">
                            {selectedOrder.payment_method === 'card' ? 'Carta (POS)' : 'Contanti'}
                          </span>
                        </div>
                      )}
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
                      onClick={() => printReceipt(selectedOrder, storeInfo || undefined)}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Stampa
                    </Button>
                    {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                      <div className="flex flex-1 gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => {
                            const next = getNextStatus(selectedOrder.status)
                            if (next) {
                              handleStatusChange(selectedOrder.id, next)
                            }
                          }}
                        >
                          {getNextStatusLabel(selectedOrder.status)}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Cambia stato ordine">
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="top" align="end">
                            {getStatusOptions(selectedOrder.status).map((key) => (
                              <DropdownMenuItem
                                key={key}
                                onClick={() => handleStatusChange(selectedOrder.id, key)}
                              >
                                {statusConfig[key].label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
