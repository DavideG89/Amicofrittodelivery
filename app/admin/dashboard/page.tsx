'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package, ShoppingCart, Euro, TrendingUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    todayRevenue: 0
  })
  const [dailyRevenue, setDailyRevenue] = useState<{ date: string; total: number }[]>([])

  useEffect(() => {
    async function fetchStats() {
      try {
        // Count products
        const { count: productsCount } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })

        // Count all orders
        const { count: ordersCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })

        // Count pending orders
        const { count: pendingCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')

        // Daily revenue table (preferred)
        const { data: dailyRevenueData } = await supabase
          .from('daily_revenue')
          .select('day, total')
          .order('day', { ascending: false })

        const dailyRows = (dailyRevenueData || []).map((row) => ({
          date: new Date(row.day).toLocaleDateString('it-IT'),
          total: Number(row.total || 0),
        }))

        // Calculate today's revenue (fallback to orders if daily table has no entry for today)
        let revenue = 0
        const todayKey = new Date().toLocaleDateString('it-IT')
        const todayRow = dailyRows.find((row) => row.date === todayKey)
        if (todayRow) {
          revenue = todayRow.total || 0
        } else {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const { data: todayOrders } = await supabase
            .from('orders')
            .select('total')
            .gte('created_at', today.toISOString())
            .neq('status', 'cancelled')
          revenue = todayOrders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0
        }

        setDailyRevenue(dailyRows)

        setStats({
          totalProducts: productsCount || 0,
          totalOrders: ordersCount || 0,
          pendingOrders: pendingCount || 0,
          todayRevenue: revenue
        })
      } catch (error) {
        console.error('[v0] Error fetching stats:', error)
      }
    }

    fetchStats()
  }, [])

  const statCards = [
    {
      title: 'Prodotti Totali',
      value: stats.totalProducts,
      icon: Package,
      description: 'Prodotti nel menu'
    },
    {
      title: 'Ordini Totali',
      value: stats.totalOrders,
      icon: ShoppingCart,
      description: 'Ordini ricevuti'
    },
    {
      title: 'Ordini in Attesa',
      value: stats.pendingOrders,
      icon: TrendingUp,
      description: 'Da gestire',
      highlight: stats.pendingOrders > 0
    },
    {
      title: 'Incasso Oggi',
      value: `${stats.todayRevenue.toFixed(2)}€`,
      icon: Euro,
      description: 'Fatturato giornaliero'
    }
  ]

  return (
    <div className="p-6">
      <div className="mb-8">
        <DropdownMenu>
          <DropdownMenuTrigger className="text-left">
            <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
              Dashboard
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </h1>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard')}>
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard/orders')}>
              Ordini
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard/menu')}>
              Menu
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard/upsell')}>
              Upsell
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard/discounts')}>
              Sconti
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/admin/dashboard/settings')}>
              Impostazioni
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground">Panoramica del tuo ristorante</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          const isOrdersTotal = stat.title === 'Ordini Totali'
          const isOrdersPending = stat.title === 'Ordini in Attesa'
          const isClickable = isOrdersTotal || isOrdersPending
          const content = (
            <Card className={`${stat.highlight ? 'border-primary' : ''} ${isClickable ? 'hover:border-primary transition-colors' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )

          if (isOrdersTotal) {
            return (
              <Link key={stat.title} href="/admin/dashboard/orders?tab=all" className="block">
                {content}
              </Link>
            )
          }

          if (isOrdersPending) {
            return (
              <Link key={stat.title} href="/admin/dashboard/orders?tab=pending" className="block">
                {content}
              </Link>
            )
          }

          return <div key={stat.title}>{content}</div>
        })}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Benvenuto!</CardTitle>
            <CardDescription>
              Gestisci il tuo ristorante dalla dashboard amministrativa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• Controlla gli ordini in tempo reale</li>
              <li>• Gestisci il menu e i prodotti</li>
              <li>• Crea e gestisci codici sconto</li>
              <li>• Aggiorna le informazioni del locale</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Accedi rapidamente alle funzioni principali
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a 
              href="/admin/dashboard/orders" 
              className="block p-3 rounded-md hover:bg-muted transition-colors"
            >
              <div className="font-medium">Visualizza Ordini</div>
              <div className="text-xs text-muted-foreground">Gestisci gli ordini in arrivo</div>
            </a>
            <a 
              href="/admin/dashboard/menu" 
              className="block p-3 rounded-md hover:bg-muted transition-colors"
            >
              <div className="font-medium">Modifica Menu</div>
              <div className="text-xs text-muted-foreground">Aggiungi o modifica prodotti</div>
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Incassi Giornalieri</CardTitle>
            <CardDescription>Riepilogo incassi per giorno</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun incasso disponibile.</p>
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
                    <TableRow key={row.date}>
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
    </div>
  )
}
