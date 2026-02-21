'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'install-banner-dismissed'

const isIOS = (ua: string) => /iphone|ipad|ipod/i.test(ua)

export function InstallBanner() {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(true)
  const [installReady, setInstallReady] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  const shouldHide = useMemo(() => pathname.startsWith('/admin'), [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissedValue = localStorage.getItem(DISMISS_KEY) === 'true'
    setDismissed(dismissedValue)
    setIsIosDevice(isIOS(window.navigator.userAgent))

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      deferredPromptRef.current = event as BeforeInstallPromptEvent
      setInstallReady(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  if (shouldHide || dismissed) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // ignore storage errors
    }
    setDismissed(true)
  }

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) return
    await prompt.prompt()
    try {
      await prompt.userChoice
    } catch {
      // ignore
    }
    deferredPromptRef.current = null
    setInstallReady(false)
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="container px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm sm:text-base">
          <span className="font-medium">Installa l&apos;app per un accesso rapido.</span>{' '}
          {isIosDevice ? (
            <span>Su iPhone: Condividi → Aggiungi a Home.</span>
          ) : (
            <span>Su Android puoi aggiungerla alla schermata home.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {installReady && (
            <Button size="sm" onClick={handleInstall}>
              Installa app
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleDismiss} aria-label="Chiudi">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
