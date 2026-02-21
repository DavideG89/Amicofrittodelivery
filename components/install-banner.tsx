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
const isAndroid = (ua: string) => /android/i.test(ua)

export function InstallBanner() {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(true)
  const [installReady, setInstallReady] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [isAndroidDevice, setIsAndroidDevice] = useState(false)
  const [showAndroidHelp, setShowAndroidHelp] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  const shouldHide = useMemo(() => pathname.startsWith('/admin'), [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent
    const isIos = isIOS(ua)
    const isAnd = isAndroid(ua)
    setDismissed(false)
    setIsIosDevice(isIos)
    setIsAndroidDevice(isAnd)

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
      // keep banner shown on every refresh
    } catch {
      // ignore storage errors
    }
    setDismissed(true)
  }

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) {
      if (!isIosDevice) {
        setShowAndroidHelp(true)
        window.setTimeout(() => setShowAndroidHelp(false), 6000)
      }
      return
    }
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
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="container relative px-4 sm:px-6 lg:px-8 py-2.5">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          aria-label="Chiudi"
          className="absolute right-2 top-2 h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-2 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm sm:text-base">
            <span className="font-medium">Installa l&apos;app per un accesso rapido.</span>{' '}
            {isIosDevice ? (
              <span>Su iPhone: Condividi → Aggiungi a Home.</span>
            ) : (
              <span>Su Android puoi aggiungerla alla schermata home.</span>
            )}
          </div>
          {!isIosDevice && (
            <Button size="sm" onClick={handleInstall}>
              Installa app
            </Button>
          )}
        </div>
        {!isIosDevice && showAndroidHelp && (
          <p className="mt-2 text-xs text-amber-800">
            Apri il menu del browser e scegli “Aggiungi a schermata Home”.
          </p>
        )}
      </div>
    </div>
  )
}
