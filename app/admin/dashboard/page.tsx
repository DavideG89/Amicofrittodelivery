'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { it } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Euro,
  MapPinned,
  Percent,
  Printer,
  Settings,
  ShoppingCart,
  Ticket,
  Utensils,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase, Order, StoreInfo } from '@/lib/supabase'
import { hasSavedNativePrinterConfig, printOrderOnNativePrinter } from '@/lib/native-printer'
import { printReceipt } from '@/lib/print-receipt'
import { toast } from 'sonner'

type DailyRevenueRow = { key: string; date: string; total: number }
type RevenuePoint = { label: string; total: number }

const orderSelect =
  'id, order_number, customer_name, customer_phone, customer_address, order_type, payment_method, items, subtotal, discount_code, discount_amount, delivery_fee, total, status, notes, created_at, updated_at'

const brandYellow = '#ffc400'
const brandYellowSoft = '#fff6d7'
const brandRed = '#ff2d20'
const brandGreen = '#1aa33b'

function toLocalDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-')
  if (!year || !month || !day) return dayKey
  return `${day}/${month}/${year}`
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function normalizeItems(items: Order['items']) {
  return items.map((item) => ({
    ...item,
    price: toNumber(item.price),
    quantity: toNumber(item.quantity, 1),
    additions_unit_price: toNumber(item.additions_unit_price),
  }))
}

function toItems(value: unknown): Order['items'] {
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

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    items: toItems(order.items),
    subtotal: toNumber(order.subtotal),
    discount_amount: toNumber(order.discount_amount),
    delivery_fee: toNumber(order.delivery_fee),
    total: toNumber(order.total),
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
}

function compactItems(order: Order) {
  return order.items
    .slice(0, 3)
    .map((item) => `${item.quantity > 1 ? `${item.quantity} ` : ''}${item.name}`)
    .join(' • ')
}

function buildCumulativeRevenue(rows: DailyRevenueRow[]): RevenuePoint[] {
  let runningTotal = 0
  return rows.map((row) => {
    runningTotal += row.total
    return { label: row.key.slice(8, 10), total: runningTotal }
  })
}

function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const maxTotal = Math.max(...points.map((point) => point.total), 1)
  const width = 640
  const height = 220
  const padding = { top: 18, right: 18, bottom: 30, left: 44 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const coordinates = points.map((point, index) => {
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * chartWidth
    const y = padding.top + chartHeight - (point.total / maxTotal) * chartHeight
    return { x, y, total: point.total, label: point.label }
  })
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${path} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`
  const lastPoint = coordinates[coordinates.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" role="img" aria-label="Andamento incasso mese corrente">
      <defs>
        <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={brandYellow} stopOpacity="0.34" />
          <stop offset="100%" stopColor={brandYellow} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[0, 0.33, 0.66, 1].map((ratio) => {
        const y = padding.top + chartHeight * ratio
        return <line key={ratio} x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} stroke="#e5e7eb" />
      })}
      {coordinates
        .filter((_, index) => index === 0 || index === coordinates.length - 1 || index % Math.max(1, Math.ceil(coordinates.length / 4)) === 0)
        .map((point, index) => {
        return (
          <text key={`${point.label}-${index}`} x={point.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {point.label}
          </text>
        )
      })}
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + chartHeight - chartHeight * ratio
        return (
          <text key={ratio} x={8} y={y + 4} className="fill-muted-foreground text-[11px]">
            {Math.round(maxTotal * ratio)}€
          </text>
        )
      })}
      <path d={areaPath} fill="url(#revenueFill)" />
      <path d={path} fill="none" stroke={brandYellow} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {lastPoint && lastPoint.total > 0 && (
        <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill={brandYellow} stroke="#fff7d6" strokeWidth="4" />
      )}
    </svg>
  )
}

export default function AdminDashboardPage() {
  const searchParams = useSearchParams()
  const orderIdParam = searchParams.get('orderId')
  const pushTsParam = searchParams.get('pushTs')
  const [stats, setStats] = useState({
    todayOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    todayRevenue: 0,
  })
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenueRow[]>([])
  const [showAllDailyRevenue, setShowAllDailyRevenue] = useState(false)
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null)

  const currentMonthPrefix = toLocalDayKey(new Date()).slice(0, 7)
  const currentMonthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date())
  const currentMonthStart = `${currentMonthPrefix}-01`
  const businessStartDay = '2026-03-11'
  const dailyRevenueTotal = dailyRevenue.reduce((sum, row) => sum + row.total, 0)
  const displayedPendingCount = stats.pendingOrders
  const todayKey = toLocalDayKey(new Date())
  const currentMonthRevenueRows = useMemo(() => {
    const rows = dailyRevenue
      .filter((row) => row.key.startsWith(currentMonthPrefix) && row.key !== todayKey)
      .map((row) => ({ ...row }))

    if (stats.todayRevenue > 0) {
      rows.push({
        key: todayKey,
        date: formatDayKey(todayKey),
        total: stats.todayRevenue,
      })
    }

    return rows.sort((a, b) => a.key.localeCompare(b.key))
  }, [currentMonthPrefix, dailyRevenue, stats.todayRevenue, todayKey])
  const currentMonthRevenueTotal = currentMonthRevenueRows.reduce((sum, row) => sum + row.total, 0)
  const monthlyRevenue = useMemo(() => buildCumulativeRevenue(currentMonthRevenueRows), [currentMonthRevenueRows])

  const fetchLiveStats = useCallback(async () => {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayIso = today.toISOString()

      const [
        pendingCountResult,
        todayOrdersResult,
        completedCountResult,
        pendingOrdersResult,
        storeInfoResult,
      ] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select(orderSelect).gte('created_at', todayIso).neq('status', 'cancelled'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayIso).eq('status', 'completed'),
        supabase.from('orders').select(orderSelect).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('store_info').select('id, name, address, phone, opening_hours, delivery_fee, min_order_delivery, updated_at').limit(1).maybeSingle(),
      ])

      const todayOrders = (todayOrdersResult.data || []).map((order) => normalizeOrder(order as Order))
      const revenue = todayOrders.reduce((sum, order) => sum + order.total, 0)

      setStats({
        todayOrders: todayOrders.length,
        pendingOrders: pendingCountResult.count || 0,
        completedOrders: completedCountResult.count || 0,
        todayRevenue: revenue,
      })
      setPendingOrders((pendingOrdersResult.data || []).map((order) => normalizeOrder(order as Order)))
      if (storeInfoResult.data) {
        setStoreInfo(storeInfoResult.data as StoreInfo)
      }
    } catch (error) {
      console.error('[dashboard] Error fetching live stats:', error)
    }
  }, [])

  const fetchDailyRevenue = useCallback(async () => {
    try {
      let query = supabase
        .from('daily_revenue')
        .select('day, total')
        .gte('day', businessStartDay)
        .order('day', { ascending: false })

      if (!showAllDailyRevenue) {
        query = query.gte('day', currentMonthStart)
      }

      const { data: dailyRevenueData } = await query

      const dailyRows = (dailyRevenueData || [])
        .map((row) => {
          const key = typeof row.day === 'string' ? row.day : toLocalDayKey(new Date(row.day))
          return {
            key,
            date: formatDayKey(key),
            total: Number(row.total || 0),
          }
        })
        .sort((a, b) => b.key.localeCompare(a.key))

      setDailyRevenue(dailyRows)
    } catch (error) {
      console.error('[dashboard] Error fetching daily revenue:', error)
    }
  }, [businessStartDay, currentMonthStart, showAllDailyRevenue])

  const refreshDashboard = useCallback(() => {
    void fetchLiveStats()
    void fetchDailyRevenue()
  }, [fetchDailyRevenue, fetchLiveStats])

  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard, orderIdParam, pushTsParam])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshDashboard()
    }
    const handleFocus = () => refreshDashboard()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshDashboard])

  useEffect(() => {
    const canUseRealtime =
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof WebSocket !== 'undefined'

    let channel: ReturnType<typeof supabase.channel> | null = null
    let pollingId: number | null = null

    const startPolling = () => {
      if (pollingId !== null) return
      pollingId = window.setInterval(() => {
        void fetchLiveStats()
      }, 20000)
    }

    if (canUseRealtime) {
      try {
        channel = supabase
          .channel('dashboard_orders_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            void fetchLiveStats()
          })
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling()
          })
      } catch {
        startPolling()
      }
    } else {
      startPolling()
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (pollingId !== null) window.clearInterval(pollingId)
    }
  }, [fetchLiveStats])

  const handleStatusChange = async (order: Order, status: Order['status']) => {
    try {
      setUpdatingOrderId(order.id)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sessione admin non valida')

      const shouldPrintOnNative =
        Capacitor.isNativePlatform() &&
        hasSavedNativePrinterConfig() &&
        (status === 'confirmed' || status === 'preparing')

      const res = await fetch('/api/admin/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          status,
          skipPrintQueue: shouldPrintOnNative,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Errore aggiornamento ordine')

      let printedNatively = false
      if (shouldPrintOnNative) {
        try {
          await printOrderOnNativePrinter({ ...order, status }, {
            name: storeInfo?.name || 'AMICO FRITTO',
            phone: storeInfo?.phone ?? null,
            address: storeInfo?.address ?? null,
          })
          printedNatively = true
        } catch (printError) {
          console.error('[dashboard] Native print error:', printError)
          const message = printError instanceof Error ? printError.message : 'Errore stampa Bluetooth'
          toast.error(message)
        }
      }

      toast.success(
        status === 'cancelled'
          ? 'Ordine rifiutato'
          : printedNatively
            ? 'Ordine accettato e comanda stampata'
            : payload?.printQueued
              ? 'Ordine accettato e stampa accodata'
              : 'Ordine accettato'
      )
      refreshDashboard()
    } catch (error) {
      console.error('[dashboard] Error updating order:', error)
      const message = error instanceof Error ? error.message : 'Errore durante l aggiornamento'
      toast.error(message)
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleDirectPrint = async (order: Order) => {
    try {
      setPrintingOrderId(order.id)
      if (Capacitor.isNativePlatform()) {
        await printOrderOnNativePrinter(order, {
          name: storeInfo?.name || 'AMICO FRITTO',
          phone: storeInfo?.phone ?? null,
          address: storeInfo?.address ?? null,
        })
        toast.success('Comanda inviata alla stampante Bluetooth')
        return
      }

      printReceipt(
        order,
        {
          name: storeInfo?.name || 'AMICO FRITTO',
          phone: storeInfo?.phone ?? null,
          address: storeInfo?.address ?? null,
        },
        {
          preferPopup: true,
          suppressAlert: true,
          onError: (message) => toast.error(message),
        }
      )
    } catch (error) {
      console.error('[dashboard] Print error:', error)
      const message = error instanceof Error ? error.message : 'Errore stampa'
      toast.error(message)
    } finally {
      setPrintingOrderId(null)
    }
  }

  const statCards = [
    {
      title: 'Nuovi ordini',
      value: stats.pendingOrders,
      description: 'Da accettare',
      icon: ShoppingCart,
      href: '/admin/dashboard/orders?tab=pending',
      tone: 'yellow' as const,
    },
    {
      title: 'Incasso oggi',
      value: formatCurrency(stats.todayRevenue),
      description: 'Live dagli ordini non annullati',
      icon: Euro,
      href: null,
      tone: 'green' as const,
    },
    {
      title: 'Ordini totali',
      value: stats.todayOrders,
      description: 'Oggi',
      icon: Ticket,
      href: '/admin/dashboard/orders?tab=all',
      tone: 'purple' as const,
    },
    {
      title: 'Ordini completati',
      value: stats.completedOrders,
      description: 'Oggi',
      icon: Check,
      href: '/admin/dashboard/orders?tab=completed',
      tone: 'blue' as const,
    },
  ]

  const quickActions = [
    { href: '/admin/dashboard/menu', title: 'Gestisci Menu', description: 'Aggiungi o modifica prodotti', icon: Utensils },
    { href: '/admin/dashboard/discounts', title: 'Crea sconto', description: 'Promozioni e offerte', icon: Percent },
    { href: '/admin/dashboard/delivery-area', title: 'Area Delivery', description: 'Zone e tariffe', icon: MapPinned },
    { href: '/admin/dashboard/upsell', title: 'Upsell', description: 'Suggerimenti e combo', icon: Zap },
  ]

  return (
    <div className="min-h-full bg-[#f6f5f2] p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center justify-between gap-3 md:hidden">
            <h1 className="text-2xl font-black text-zinc-950">Dashboard</h1>
            <div className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm">
              <CalendarDays className="h-4 w-4" />
              <span>{new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date())}</span>
            </div>
          </div>
          <h1 className="hidden text-3xl font-black tracking-normal text-zinc-950 md:block">Dashboard</h1>
          <p className="mt-1 text-base text-zinc-600">Panoramica del tuo ristorante</p>
        </div>

        <div className="hidden flex-wrap items-center gap-3 md:flex">
          <Button variant="outline" className="h-12 gap-2 rounded-lg border-zinc-200 bg-white shadow-sm">
            <Bell className="h-4 w-4" />
            <span>Notifiche</span>
            {displayedPendingCount > 0 && (
              <span className="ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: brandRed }}>
                {displayedPendingCount}
              </span>
            )}
          </Button>
          <Button variant="outline" className="h-12 gap-2 rounded-lg border-zinc-200 bg-white shadow-sm">
            <CalendarDays className="h-4 w-4" />
            <span>{new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</span>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          const card = (
            <Card
              className="overflow-hidden rounded-lg border-zinc-200 bg-white shadow-sm"
              style={stat.tone === 'yellow' ? { borderColor: brandYellow, backgroundColor: brandYellowSoft } : undefined}
            >
              <CardContent className="p-4 sm:p-5 lg:p-6">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase leading-tight text-zinc-900 sm:text-sm">{stat.title}</p>
                    <div className="mt-3 text-3xl font-black tracking-normal text-zinc-950 sm:mt-4 sm:text-4xl">
                      {stat.value}
                    </div>
                    <p
                      className={`mt-2 text-xs font-medium leading-tight sm:mt-3 sm:text-sm ${stat.tone === 'yellow' ? '' : 'text-zinc-500'}`}
                      style={stat.tone === 'yellow' ? { color: brandRed } : undefined}
                    >
                      {stat.description}
                    </p>
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${
                    stat.tone === 'green'
                      ? 'bg-[#d9f7de] text-[#1aa33b]'
                      : stat.tone === 'purple'
                        ? 'bg-[#eee5ff] text-[#7c3aed]'
                        : stat.tone === 'blue'
                          ? 'bg-[#dceaff] text-[#2563eb]'
                      : 'bg-[#ffdf73] text-zinc-950'
                  }`}>
                    <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>
              </CardContent>
              {stat.tone === 'yellow' && (
                <div className="border-t px-3 py-2.5 text-center text-xs font-bold text-zinc-950 sm:px-6 sm:py-4 sm:text-sm" style={{ borderColor: '#e7b000', backgroundColor: brandYellow }}>
                  Vai agli ordini <ArrowRight className="ml-2 inline h-4 w-4" />
                </div>
              )}
            </Card>
          )

          return !stat.href ? (
            <div key={stat.title}>
              {card}
            </div>
          ) : stat.href.startsWith('#') ? (
            <a key={stat.title} href={stat.href} className="block">
              {card}
            </a>
          ) : (
            <Link key={stat.title} href={stat.href} className="block">
              {card}
            </Link>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-5">
            <div>
              <CardTitle className="flex items-center gap-3 text-xl font-black">
                Nuovi ordini
                <Badge className="rounded-full px-2 text-white" style={{ backgroundColor: brandRed }}>{displayedPendingCount}</Badge>
              </CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-2 text-blue-700">
              <Link href="/admin/dashboard/orders?tab=pending">
                Vedi tutti gli ordini <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {pendingOrders.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-500">Nessun nuovo ordine da accettare.</div>
            ) : (
              <div className="divide-y">
                {pendingOrders.map((order) => {
                  const createdAt = new Date(order.created_at)
                  const timeLabel = Number.isFinite(createdAt.getTime())
                    ? createdAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    : '--:--'
                  const distanceLabel = Number.isFinite(createdAt.getTime())
                    ? formatDistanceToNowStrict(createdAt, { locale: it, addSuffix: false })
                    : ''
                  const isBusy = updatingOrderId === order.id
                  const isPrinting = printingOrderId === order.id

                  return (
                    <div
                      key={order.id}
                      className="grid gap-4 border-l-4 px-4 py-4 sm:grid-cols-[88px_1fr_auto] sm:px-6"
                      style={{ borderLeftColor: brandRed }}
                    >
                      <div className="sm:border-r sm:border-zinc-200 sm:pr-4">
                        <div className="text-lg font-black" style={{ color: brandRed }}>{timeLabel}</div>
                        <div className="mt-1 text-xs text-zinc-500">{distanceLabel}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-xl font-black text-zinc-950">#{order.order_number}</div>
                          <Badge className="rounded-full bg-[#ffe6a1] text-[#7a5200] hover:bg-[#ffe6a1]">
                            NUOVO
                          </Badge>
                          <Badge variant="outline">{order.order_type === 'delivery' ? 'Consegna' : 'Ritiro'}</Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-zinc-700">{order.customer_name}</p>
                        <p className="mt-1 truncate text-sm text-zinc-500">{compactItems(order) || 'Articoli ordine non disponibili'}</p>
                      </div>
                      <div className="flex flex-col justify-between gap-4 sm:min-w-[250px]">
                        <div className="text-left text-xl font-black text-zinc-950 sm:text-right">{formatCurrency(order.total)}</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="hover:bg-red-50"
                            style={{ borderColor: '#ff9b94', color: brandRed }}
                            disabled={isBusy}
                            onClick={() => handleStatusChange(order, 'cancelled')}
                          >
                            <X className="mr-1 h-4 w-4" />
                            Rifiuta
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isPrinting}
                            onClick={() => handleDirectPrint(order)}
                          >
                            <Printer className="mr-1 h-4 w-4" />
                            Stampa
                          </Button>
                          <Button
                            type="button"
                            className="text-zinc-950 hover:brightness-95"
                            style={{ backgroundColor: brandYellow }}
                            disabled={isBusy}
                            onClick={() => handleStatusChange(order, 'preparing')}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Accetta
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <Card className="h-full rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base font-black">Andamento incasso</CardTitle>
                <CardDescription>Mese corrente, storico salvato + oggi live</CardDescription>
              </div>
              <Badge variant="outline">{currentMonthLabel}</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-zinc-950">{formatCurrency(currentMonthRevenueTotal)}</div>
              <p className="mt-1 text-sm font-medium" style={{ color: brandGreen }}>Include l'incasso live di oggi</p>
              {monthlyRevenue.length > 0 ? (
                <RevenueChart points={monthlyRevenue} />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
                  Nessun incasso nel mese corrente.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[120px_1fr]">
        <div className="pt-2 text-lg font-black text-zinc-950">Azioni rapide</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-[#ffc400]">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ffe6a1] text-zinc-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-black text-zinc-950">{action.title}</div>
                    <div className="text-sm text-zinc-500">{action.description}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div id="incassi" className="mt-6">
        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl font-black">Incassi giornalieri</CardTitle>
              <p className="mt-1 text-sm font-semibold">Totale: {dailyRevenueTotal.toFixed(2)}€</p>
              <CardDescription>
                {showAllDailyRevenue ? 'Riepilogo di tutti gli incassi salvati' : `Riepilogo mese corrente (${currentMonthLabel})`}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllDailyRevenue((prev) => !prev)}
            >
              {showAllDailyRevenue ? 'Mostra solo mese corrente' : 'Mostra tutti gli incassi passati'}
            </Button>
          </CardHeader>
          <CardContent>
            {dailyRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {showAllDailyRevenue ? 'Nessun incasso disponibile.' : 'Nessun incasso nel mese corrente.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Incasso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRevenue.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell className="text-right">{row.total.toFixed(2)}€</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Button asChild variant="outline" className="fixed bottom-5 right-5 hidden gap-2 rounded-full bg-white shadow-lg md:inline-flex xl:hidden">
        <Link href="/admin/dashboard/settings">
          <Settings className="h-4 w-4" />
          Impostazioni
        </Link>
      </Button>
    </div>
  )
}
