'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, CheckCircle, XCircle, Package, Truck, Printer, X, ChevronUp, ChevronDown } from 'lucide-react'
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
  confirmed: { label: 'In preparazione', icon: Package, variant: 'default' as const },
  preparing: { label: 'In preparazione', icon: Package, variant: 'default' as const },
  ready: { label: 'Pronto', icon: Truck, variant: 'default' as const },
  completed: { label: 'Completato', icon: CheckCircle, variant: 'default' as const },
  cancelled: { label: 'Annullato', icon: XCircle, variant: 'destructive' as const }
}

const statusOrder: Order['status'][] = ['pending', 'preparing', 'ready', 'completed', 'cancelled']

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
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
  if (Array.isArray(value)) {
    return normalizeItems(value as Order['items'])
  }
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

const getStatusOptions = (current: Order['status']): Order['status'][] => {
  if (current === 'ready') {
    return ['ready', 'completed', 'cancelled']
  }
  return [...statusOrder]
}

const getNextStatus = (current: Order['status']): Order['status'] | null => {
  const nextStatus: Record<Order['status'], Order['status'] | null> = {
    pending: 'preparing',
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
    : statusConfig[next].label === 'Pronto'
        ? 'Segna come pronto'
        : `Passa a ${statusConfig[next].label.toLowerCase()}`
}

export default function OrdersManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [storeInfo, setStoreInfo] = useState<{ name: string; phone?: string | null; address?: string | null } | null>(null)
  const isMobile = useIsMobile()
  const [realtimeStatus, setRealtimeStatus] = useState<'active' | 'polling'>('active')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const adminPages = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/dashboard/orders', label: 'Ordini' },
    { href: '/admin/dashboard/menu', label: 'Menu' },
    { href: '/admin/dashboard/upsell', label: 'Upsell' },
    { href: '/admin/dashboard/discounts', label: 'Sconti' },
    { href: '/admin/dashboard/settings', label: 'Impostazioni' },
  ]
  const allowedTabs = ['pending', 'active', 'completed', 'all'] as const
  const normalizeTab = (value: string | null): (typeof allowedTabs)[number] => {
    if (value === 'delivery') return 'active'
    return allowedTabs.includes((value ?? '') as (typeof allowedTabs)[number])
      ? (value as (typeof allowedTabs)[number])
      : 'pending'
  }
  const initialTab = normalizeTab(searchParams.get('tab'))
  const [activeTab, setActiveTab] = useState<(typeof allowedTabs)[number]>(initialTab)
  const pageSize = 20
  const lastFetchAtRef = useRef(0)
  const minFetchIntervalMs = 30000
  const pollingIntervalMs = 60000
  const pollingIdRef = useRef<number | null>(null)
  const isLeaderRef = useRef(false)

  useEffect(() => {
    const requested = searchParams.get('tab')
    if (!requested) return
    setActiveTab(normalizeTab(requested))
  }, [searchParams])

  useEffect(() => {
    maybeFetchOrders(true)
    fetchStoreInfo()

    const canUseRealtime =
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof WebSocket !== 'undefined'

    let channel: ReturnType<typeof supabase.channel> | null = null
    let leaderHeartbeatId: number | null = null
    let leaderChannel: BroadcastChannel | null = null
    const leaderKey = 'af:admin-poll-leader'
    const leaderTtlMs = 90000
    const leaderHeartbeatMs = 30000

    const getTabId = () => {
      try {
        const existing = sessionStorage.getItem('af:admin-tab-id')
        if (existing) return existing
        const generated =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        sessionStorage.setItem('af:admin-tab-id', generated)
        return generated
      } catch {
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
    }

    const tabId = getTabId()

    const readLeader = (): { id: string; ts: number } | null => {
      try {
        const raw = localStorage.getItem(leaderKey)
        if (!raw) return null
        const parsed = JSON.parse(raw) as { id?: string; ts?: number }
        if (typeof parsed.id !== 'string' || typeof parsed.ts !== 'number') return null
        return { id: parsed.id, ts: parsed.ts }
      } catch {
        return null
      }
    }

    const writeLeader = (id: string) => {
      try {
        localStorage.setItem(leaderKey, JSON.stringify({ id, ts: Date.now() }))
      } catch {
        // ignore storage errors
      }
    }

    const clearLeader = () => {
      try {
        const current = readLeader()
        if (current?.id === tabId) {
          localStorage.removeItem(leaderKey)
        }
      } catch {
        // ignore storage errors
      }
    }

    const stopPolling = () => {
      if (pollingIdRef.current === null) return
      window.clearInterval(pollingIdRef.current)
      pollingIdRef.current = null
    }

    const startPolling = () => {
      if (!isLeaderRef.current) return
      if (pollingIdRef.current !== null) return
      setRealtimeStatus('polling')
      pollingIdRef.current = window.setInterval(() => {
        maybeFetchOrders()
      }, pollingIntervalMs)
    }

    const becomeLeader = () => {
      if (isLeaderRef.current) return
      isLeaderRef.current = true
      writeLeader(tabId)
      startPolling()
      if (leaderHeartbeatId === null) {
        leaderHeartbeatId = window.setInterval(() => {
          writeLeader(tabId)
        }, leaderHeartbeatMs)
      }
      leaderChannel?.postMessage({ type: 'leader', id: tabId })
    }

    const resignLeader = () => {
      if (!isLeaderRef.current) return
      isLeaderRef.current = false
      stopPolling()
      if (leaderHeartbeatId !== null) {
        window.clearInterval(leaderHeartbeatId)
        leaderHeartbeatId = null
      }
      clearLeader()
    }

    const tryClaimLeadership = () => {
      const current = readLeader()
      const now = Date.now()
      if (!current || now - current.ts > leaderTtlMs) {
        becomeLeader()
        return
      }
      if (current.id === tabId) {
        becomeLeader()
        return
      }
      // another tab is leader
      resignLeader()
    }

    const handleLeaderMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string }
      if (data?.type === 'leader' && data.id !== tabId) {
        tryClaimLeadership()
      }
    }

    tryClaimLeadership()
    if (typeof BroadcastChannel !== 'undefined') {
      leaderChannel = new BroadcastChannel('af:admin-poll')
      leaderChannel.addEventListener('message', handleLeaderMessage)
    }

    if (canUseRealtime) {
      try {
        // Subscribe to real-time updates
        channel = supabase
          .channel('orders_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            maybeFetchOrders()
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setRealtimeStatus('active')
              return
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              startPolling()
            }
          })
      } catch {
        startPolling()
      }
    } else {
      startPolling()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        maybeFetchOrders()
        tryClaimLeadership()
      }
    }

    const handleFocus = () => {
      maybeFetchOrders()
      tryClaimLeadership()
    }

    const handleBeforeUnload = () => {
      resignLeader()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (channel) supabase.removeChannel(channel)
      if (pollingIdRef.current !== null) window.clearInterval(pollingIdRef.current)
      pollingIdRef.current = null
      if (leaderHeartbeatId !== null) window.clearInterval(leaderHeartbeatId)
      leaderHeartbeatId = null
      leaderChannel?.removeEventListener('message', handleLeaderMessage)
      leaderChannel?.close()
      resignLeader()
    }
  }, [])

  const shouldFetch = (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchAtRef.current < minFetchIntervalMs) return false
    lastFetchAtRef.current = now
    return true
  }

  const maybeFetchOrders = (force = false, reset = true, pageOverride?: number) => {
    if (!shouldFetch(force)) return
    fetchOrders(reset, pageOverride)
  }

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

  async function fetchOrders(reset = false, pageOverride?: number) {
    try {
      const nextPage = reset ? 0 : (pageOverride ?? page)
      const from = nextPage * pageSize
      const to = from + pageSize - 1
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, customer_address, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, status, notes, created_at, updated_at')
        .order('created_at', { ascending: true })
        .range(from, to)

      if (error) throw error
      const normalized = (data || []).map(normalizeOrder)
      if (reset) {
        setOrders(normalized)
        setPage(0)
      } else {
        setOrders((prev) => {
          const merged = [...prev, ...normalized]
          const seen = new Set<string>()
          return merged.filter((order) => {
            if (seen.has(order.id)) return false
            seen.add(order.id)
            return true
          })
        })
      }
      setHasMore((data || []).length === pageSize)
    } catch (error) {
      console.error('[v0] Error fetching orders:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    setPage(nextPage)
    fetchOrders(false, nextPage)
  }

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error('Sessione admin non valida')
      }

      const res = await fetch('/api/admin/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId, status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Errore aggiornamento ordine')
      }

      toast.success('Stato aggiornato')
      fetchOrders(true)
      
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
            {paymentLabel && (
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
  const activeOrders = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status))
  const completedOrders = filterOrdersByStatus('completed')

  return (
    <div className="p-6 h-full flex flex-col min-h-0">
      <div className="mb-6 space-y-3">
        {realtimeStatus === 'polling' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Realtime non disponibile su questo dispositivo. Aggiornamento automatico ogni 20 secondi.
          </div>
        )}
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Gestione Ordini
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </h1>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {adminPages.map((page) => (
                  <DropdownMenuItem key={page.href} onSelect={() => router.push(page.href)}>
                    {page.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h1 className="hidden md:block text-3xl font-bold">Gestione Ordini</h1>
          <p className="text-muted-foreground">Visualizza e gestisci gli ordini in tempo reale</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as (typeof allowedTabs)[number])} className="w-full flex-1 min-h-0 flex flex-col">
        <div className="z-20 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b">
          <div className="overflow-x-auto -mx-6 px-6">
            <TabsList className="inline-flex w-max min-w-max justify-start gap-2 bg-muted/60 h-11 sm:h-12">
              <TabsTrigger value="pending">
                In attesa ({pendingOrders.length})
              </TabsTrigger>
            <TabsTrigger value="active">
              Confermati ({activeOrders.length})
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

        <div className="flex-1 min-h-0 overflow-y-auto pt-6">
        <TabsContent value="pending" className="mt-0">
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

        <TabsContent value="active" className="mt-0">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nessun ordine confermato</p>
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

        <TabsContent value="completed" className="mt-0">
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

        <TabsContent value="all" className="mt-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </TabsContent>
        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Caricamento...' : 'Carica altri ordini'}
            </Button>
          </div>
        )}
        </div>
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
                      {selectedOrder.payment_method && (
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
                            <div className="text-xs text-muted-foreground">
                              {(item.price + (item.additions_unit_price || 0)).toFixed(2)}€ cad.
                            </div>
                            {item.additions_unit_price && item.additions_unit_price > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Extra: +{item.additions_unit_price.toFixed(2)}€ cad.
                              </div>
                            )}
                            {item.additions && (
                              <div className="text-xs text-muted-foreground">Aggiunte: {item.additions}</div>
                            )}
                          </div>
                          <span className="font-medium">
                            {((item.price + (item.additions_unit_price || 0)) * item.quantity).toFixed(2)}€
                          </span>
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
                      {selectedOrder.payment_method && (
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
                            <div className="text-xs text-muted-foreground">
                              {(item.price + (item.additions_unit_price || 0)).toFixed(2)}€ cad.
                            </div>
                            {item.additions_unit_price && item.additions_unit_price > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Extra: +{item.additions_unit_price.toFixed(2)}€ cad.
                              </div>
                            )}
                            {item.additions && (
                              <div className="text-xs text-muted-foreground">Aggiunte: {item.additions}</div>
                            )}
                          </div>
                          <span className="font-medium">
                            {((item.price + (item.additions_unit_price || 0)) * item.quantity).toFixed(2)}€
                          </span>
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
