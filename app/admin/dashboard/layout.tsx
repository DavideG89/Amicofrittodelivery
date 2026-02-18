'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Package, Settings, ShoppingCart, LogOut, Menu as MenuIcon, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { checkAdminAuth, setAdminAuth } from '@/lib/admin-auth'
import { enableAdminPush, listenForForegroundNotifications } from '@/lib/admin-push'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/dashboard/orders', label: 'Ordini', icon: ShoppingCart },
  { href: '/admin/dashboard/menu', label: 'Menu', icon: Package },
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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabled' | 'denied' | 'unsupported' | 'error' | 'missing'>('idle')

  useEffect(() => {
    const authenticated = checkAdminAuth()
    if (!authenticated) {
      router.push('/admin/login')
    } else {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      enableAdminPush().then((result) => {
        if (result.ok) setPushStatus('enabled')
        else if (result.reason === 'missing_config') setPushStatus('missing')
      })
    } else if (Notification.permission === 'denied') {
      setPushStatus('denied')
    }
  }, [])

  useEffect(() => {
    let interval: number | undefined
    const checkUpdate = async () => {
      try {
        const res = await fetch('/version', { cache: 'no-store' })
        const data = await res.json()
        const current = String(data?.version ?? '')
        if (!current) return
        const stored = localStorage.getItem('app-version')
        if (stored && stored !== current) {
          localStorage.setItem('app-version', current)
          window.location.reload()
          return
        }
        if (!stored) localStorage.setItem('app-version', current)
      } catch {
        // ignore
      }
    }

    checkUpdate()
    interval = window.setInterval(checkUpdate, 5 * 60 * 1000)
    const onFocus = () => checkUpdate()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkUpdate()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (interval) window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    const start = async () => {
      unsubscribe = await listenForForegroundNotifications((payload) => {
        const title = payload.notification?.title ?? 'Nuovo ordine'
        const body = payload.notification?.body ?? 'È arrivato un nuovo ordine'
        toast(title, { description: body })
        playNotificationSound()
      })
    }
    start()
    return () => unsubscribe?.()
  }, [])

  const handleLogout = () => {
    setAdminAuth(false)
    router.push('/admin/login')
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

  if (isLoading || !isAuthenticated) {
    return null
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

      <div className="p-4 border-t">
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
          <header className="md:hidden border-b bg-card p-4 flex items-center justify-between">
            <Image 
              src="/logo.png" 
              alt="Amico Fritto" 
              width={100} 
              height={40}
              className="h-8 w-auto"
              priority
            />
            
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MenuIcon className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <Sidebar />
              </SheetContent>
            </Sheet>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">
            {pushStatus !== 'enabled' && (
              <div className="border-b bg-card/60 px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {pushStatus === 'denied' && 'Notifiche bloccate nel browser. Sbloccale nelle impostazioni del sito.'}
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
