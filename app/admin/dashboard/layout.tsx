'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Package, Settings, ShoppingCart, LogOut, Ticket, Sparkles, Bell, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logoutAdmin } from '@/lib/admin-auth'
import { disableAdminPush, enableAdminPush, listenForForegroundNotifications } from '@/lib/admin-push'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/dashboard/orders', label: 'Ordini', icon: ShoppingCart },
  { href: '/admin/dashboard/menu', label: 'Menu', icon: Package },
  { href: '/admin/dashboard/upsell', label: 'Upsell', icon: Sparkles },
  { href: '/admin/dashboard/discounts', label: 'Sconti', icon: Ticket },
  { href: '/admin/dashboard/settings', label: 'Impostazioni', icon: Settings },
]

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [authChecked, setAuthChecked] = useState(false)
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabled' | 'denied' | 'unsupported' | 'error' | 'missing'>('idle')
  const [showPushTooltip, setShowPushTooltip] = useState(false)
  const [pendingToneActive, setPendingToneActive] = useState(false)
  const [alertingPendingIds, setAlertingPendingIds] = useState<Set<string>>(new Set())
  const hasInitializedPendingRef = useRef(false)
  const prevPendingIdsRef = useRef<Set<string>>(new Set())
  const lastPendingFetchAtRef = useRef(0)
  const minPendingFetchIntervalMs = 30000
  const pendingPollingIntervalMs = 60000
  const pendingPollingIdRef = useRef<number | null>(null)
  const isLeaderRef = useRef(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (!data.session) {
        router.replace('/admin/login')
      } else {
        setAuthChecked(true)
      }
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/admin/login')
      } else {
        setAuthChecked(true)
      }
    })
    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    let adminPushActive = true
    try {
      adminPushActive = localStorage.getItem('admin-push:active') !== 'false'
    } catch {
      adminPushActive = true
    }
    const syncPermission = () => {
      if (Notification.permission === 'granted') {
        if (adminPushActive) {
          enableAdminPush().then((result) => {
            if (result.ok) setPushStatus('enabled')
            else if (result.reason === 'missing_config') setPushStatus('missing')
          })
        } else {
          setPushStatus('idle')
        }
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied')
      } else {
        setPushStatus('idle')
      }
    }
    syncPermission()
    const interval = window.setInterval(syncPermission, 1500)
    return () => window.clearInterval(interval)
  }, [])

  // Version checking handled globally in AppVersionChecker

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    const start = async () => {
      unsubscribe = await listenForForegroundNotifications((payload) => {
        const title = payload.notification?.title ?? 'Nuovo ordine'
        const body = payload.notification?.body ?? 'È arrivato un nuovo ordine'
        toast(title, {
          description: body,
          duration: 8000,
          icon: <Star className="h-4 w-4 text-[#ff7900]" />,
        })
        playNotificationSound()
      })
    }
    start()
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
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

    const readLeader = () => {
      try {
        const raw = localStorage.getItem(leaderKey)
        if (!raw) return null
        const parsed = JSON.parse(raw) as { id?: string; ts?: number }
        if (!parsed?.id || !parsed?.ts) return null
        return parsed
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
      if (pendingPollingIdRef.current === null) return
      window.clearInterval(pendingPollingIdRef.current)
      pendingPollingIdRef.current = null
    }

    const startPolling = () => {
      if (!isLeaderRef.current) return
      if (pendingPollingIdRef.current !== null) return
      pendingPollingIdRef.current = window.setInterval(() => {
        void fetchPendingIds()
      }, pendingPollingIntervalMs)
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
      resignLeader()
    }

    const updatePendingIds = (nextIds: Set<string>) => {
      if (!hasInitializedPendingRef.current) {
        hasInitializedPendingRef.current = true
        prevPendingIdsRef.current = nextIds
        return
      }

      const prevPendingIds = prevPendingIdsRef.current
      const newPendingIds = new Set<string>()
      nextIds.forEach((id) => {
        if (!prevPendingIds.has(id)) newPendingIds.add(id)
      })

      if (newPendingIds.size > 0) {
        setAlertingPendingIds((prev) => {
          const next = new Set(prev)
          newPendingIds.forEach((id) => next.add(id))
          return next
        })
      }

      setAlertingPendingIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set<string>()
        prev.forEach((id) => {
          if (nextIds.has(id)) next.add(id)
        })
        return next
      })

      prevPendingIdsRef.current = nextIds
    }

    const shouldFetchPending = (force = false) => {
      const now = Date.now()
      if (!force && now - lastPendingFetchAtRef.current < minPendingFetchIntervalMs) return false
      lastPendingFetchAtRef.current = now
      return true
    }

    const fetchPendingIds = async (force = false) => {
      if (!shouldFetchPending(force)) return
      const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'pending')

      const nextIds = new Set<string>((data ?? []).map((row) => row.id))
      updatePendingIds(nextIds)
    }

    const canUseRealtime =
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof WebSocket !== 'undefined'

    void fetchPendingIds(true)

    tryClaimLeadership()
    if (typeof BroadcastChannel !== 'undefined') {
      leaderChannel = new BroadcastChannel('af:admin-poll')
      leaderChannel.addEventListener('message', (event) => {
        const data = event.data as { type?: string; id?: string }
        if (data?.type === 'leader' && data.id !== tabId) {
          tryClaimLeadership()
        }
      })
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchPendingIds()
        tryClaimLeadership()
      }
    }
    const handleFocus = () => {
      void fetchPendingIds()
      tryClaimLeadership()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    if (canUseRealtime) {
      try {
        channel = supabase
          .channel('admin_pending_orders')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            void fetchPendingIds()
          })
          .subscribe((status) => {
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

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      if (channel) supabase.removeChannel(channel)
      if (pendingPollingIdRef.current !== null) window.clearInterval(pendingPollingIdRef.current)
      pendingPollingIdRef.current = null
      if (leaderHeartbeatId !== null) window.clearInterval(leaderHeartbeatId)
      leaderHeartbeatId = null
      leaderChannel?.close()
      resignLeader()
    }
  }, [])

  useEffect(() => {
    setPendingToneActive(alertingPendingIds.size > 0)
  }, [alertingPendingIds])

  useEffect(() => {
    if (!pendingToneActive) return

    const interval = window.setInterval(() => {
      playNotificationSound()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [pendingToneActive])

  const handleLogout = () => {
    logoutAdmin().finally(() => {
      router.push('/admin/login')
    })
  }

  const handleEnablePush = async () => {
    const result = await enableAdminPush()
    if (result.ok) {
      setPushStatus('enabled')
    } else {
      if (result.reason === 'unsupported') setPushStatus('unsupported')
      else if (result.reason === 'denied') setPushStatus('denied')
      else if (result.reason === 'missing_config') setPushStatus('missing')
      else setPushStatus('error')
    }
  }

  const handleDisablePush = async () => {
    await disableAdminPush()
    setPushStatus('idle')
    setShowPushTooltip(true)
    window.setTimeout(() => setShowPushTooltip(false), 2000)
  }

  const handlePushToggle = async () => {
    if (pushStatus === 'enabled') {
      await handleDisablePush()
      return
    }
    await handleEnablePush()
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b">
        <Image 
          src="/logo.png" 
          alt="Amico Fritto" 
          width={140} 
          height={50}
          className="h-10 w-auto"
          priority
        />
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                    isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t space-y-2">
        <div className="relative inline-flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePushToggle}
            className={cn(
              'inline-flex flex-col items-center gap-0.5 rounded-full border px-3 py-1 text-[11px] font-medium leading-none',
              pushStatus === 'enabled'
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                : 'border-muted text-muted-foreground bg-muted/40'
            )}
          >
            <Bell
              className={cn(
                'h-3.5 w-3.5',
                pushStatus === 'enabled' ? 'text-emerald-600' : 'text-muted-foreground'
              )}
            />
            <span>{pushStatus === 'enabled' ? 'On' : 'Off'}</span>
          </Button>
          {showPushTooltip && (
            <div className="absolute left-0 top-9 whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
              Notifiche disattivate
            </div>
          )}
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Esci
        </Button>
      </div>
    </div>
  )

  if (!authChecked) {
    return <div className="p-6">Verifica accesso...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 border-r bg-card flex-col">
          <Sidebar />
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="md:hidden border-b bg-card p-4 flex items-center justify-between gap-3">
            <Image 
              src="/logo.png" 
              alt="Amico Fritto" 
              width={100} 
              height={40}
              className="h-8 w-auto"
              priority
            />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePushToggle}
                  className={cn(
                    'inline-flex flex-col items-center gap-0.5 rounded-full border px-2 py-1 text-[10px] font-medium leading-none',
                    pushStatus === 'enabled'
                      ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                      : 'border-muted text-muted-foreground bg-muted/40'
                  )}
                >
                  <Bell
                    className={cn(
                      'h-3.5 w-3.5',
                      pushStatus === 'enabled' ? 'text-emerald-600' : 'text-muted-foreground'
                    )}
                  />
                  <span>{pushStatus === 'enabled' ? 'On' : 'Off'}</span>
                </Button>
                {showPushTooltip && (
                  <div className="absolute left-0 top-9 whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
                    Notifiche disattivate
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="h-5 w-5" />
                Esci
              </Button>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">
            {pushStatus !== 'enabled' && (
              <div className="border-b bg-card/60 px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {pushStatus === 'denied' && 'Notifiche bloccate dal browser. Chrome: lucchetto nella barra indirizzi → Notifiche → Consenti. Safari: “aA” → Impostazioni sito → Notifiche → Consenti.'}
                  {pushStatus === 'unsupported' && 'Notifiche push non supportate su questo browser.'}
                  {pushStatus === 'missing' && 'Configurazione Firebase mancante. Completa le env pubbliche.'}
                  {pushStatus === 'error' && 'Errore durante l’attivazione delle notifiche.'}
                  {pushStatus === 'idle' && 'Abilita le notifiche per ricevere i nuovi ordini.'}
                </div>
                {pushStatus === 'idle' && (
                  <Button size="sm" onClick={handleEnablePush}>
                    Abilita notifiche
                  </Button>
                )}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const audio = new Audio('/sounds/notifica_sound.wav')
    audio.volume = 0.8
    void audio.play()
  } catch {
    // ignore
  }
}
