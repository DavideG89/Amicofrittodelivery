'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { normalizeOrderNumber } from '@/lib/order-number'
import { fetchPublicOrderLight } from '@/lib/public-order-client'

type TerminalStatus = 'completed' | 'cancelled' | null
const ORDER_TERMINAL_STATUS_EVENT = 'af:order-terminal-status'
const TERMINAL_STATUS_POLL_MS = 10000
const LottiePlayer = 'lottie-player' as any

export function GlobalOrderTerminalDialog() {
  const router = useRouter()
  const [status, setStatus] = useState<TerminalStatus>(null)
  const [orderNumber, setOrderNumber] = useState<string>('')
  const [contactPhone, setContactPhone] = useState<string | null>(null)

  const markHandled = (nextStatus: Exclude<TerminalStatus, null>, number: string) => {
    try {
      sessionStorage.setItem(`order-terminal-dialog:${number}:${nextStatus}`, '1')
      localStorage.removeItem('lastOrderNumber')
      localStorage.removeItem('lastOrderActive')
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const isTerminalStatus = (value: string): value is Exclude<TerminalStatus, null> =>
      value === 'completed' || value === 'cancelled'

    const openIfNeeded = (nextStatus: Exclude<TerminalStatus, null>, number: string) => {
      const key = `order-terminal-dialog:${number}:${nextStatus}`
      const alreadyShown = sessionStorage.getItem(key) === '1'
      if (alreadyShown) return
      setOrderNumber(number)
      setStatus(nextStatus)
    }

    const broadcastTerminalStatus = (nextStatus: Exclude<TerminalStatus, null>, number: string) => {
      window.dispatchEvent(
        new CustomEvent(ORDER_TERMINAL_STATUS_EVENT, {
          detail: { orderNumber: number, status: nextStatus },
        })
      )
    }

    const checkTerminalStatus = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const number = normalizeOrderNumber(localStorage.getItem('lastOrderNumber'))
        if (!number) return

        const data = await fetchPublicOrderLight(number)

        if (cancelled || !data?.status) return
        const current = String(data.status)
        if (!isTerminalStatus(current)) return
        broadcastTerminalStatus(current, data.order_number)
        openIfNeeded(current, data.order_number)
      } catch {
        // ignore polling errors
      } finally {
        inFlight = false
      }
    }

    const onTerminalStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ orderNumber?: string; status?: string }>)?.detail
      const number = normalizeOrderNumber(detail?.orderNumber || '')
      const nextStatus = String(detail?.status || '')
      if (!number || !isTerminalStatus(nextStatus)) return
      openIfNeeded(nextStatus, number)
    }

    const onFocus = () => {
      void checkTerminalStatus()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkTerminalStatus()
      }
    }

    const id = window.setInterval(checkTerminalStatus, TERMINAL_STATUS_POLL_MS)
    window.addEventListener(ORDER_TERMINAL_STATUS_EVENT, onTerminalStatus as EventListener)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    void checkTerminalStatus()

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener(ORDER_TERMINAL_STATUS_EVENT, onTerminalStatus as EventListener)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (status !== 'cancelled') return
    let cancelled = false
    const loadPhone = async () => {
      const { data } = await supabase.from('store_info').select('phone').limit(1).maybeSingle()
      if (cancelled) return
      setContactPhone((data?.phone as string | null) ?? null)
    }
    void loadPhone()
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <>
      <Script
        src="https://unpkg.com/@lottiefiles/lottie-player@2.0.12/dist/lottie-player.js"
        strategy="afterInteractive"
      />

      <Dialog
        open={status === 'completed'}
        onOpenChange={(open) => {
          if (!open && status === 'completed' && orderNumber) {
            markHandled('completed', orderNumber)
            setStatus(null)
          }
        }}
      >
        <DialogContent className="w-[92vw] max-w-[440px] p-5 sm:p-6">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto flex w-full items-center justify-center">
              <LottiePlayer
                src="/Complete-green.json"
                background="transparent"
                speed="1"
                loop
                autoplay
                className="h-[140px] w-[190px] sm:h-[180px] sm:w-[240px] md:h-[210px] md:w-[280px]"
              />
            </div>
            <DialogTitle>Ordine completato</DialogTitle>
            <DialogDescription>Grazie :)</DialogDescription>
          </DialogHeader>
          <div className="w-full">
            <Button
              className="w-full"
              asChild
              onClick={() => {
                if (!orderNumber) return
                markHandled('completed', orderNumber)
                setStatus(null)
              }}
            >
              <Link href="/">Alla prossima</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={status === 'cancelled'}
        onOpenChange={(open) => {
          if (!open && status === 'cancelled' && orderNumber) {
            markHandled('cancelled', orderNumber)
            setStatus(null)
          }
        }}
      >
        <DialogContent className="w-[92vw] max-w-[440px] p-5 sm:p-6">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto flex w-full items-center justify-center">
              <LottiePlayer
                src="/cancel.json"
                background="transparent"
                speed="1"
                loop
                autoplay
                className="h-[140px] w-[190px] sm:h-[180px] sm:w-[240px] md:h-[210px] md:w-[280px]"
              />
            </div>
            <DialogTitle>Ci dispiace, ordine annullato</DialogTitle>
            <DialogDescription>Contattateci se l&apos;ordine ha avuto un&apos;anomalia.</DialogDescription>
          </DialogHeader>
          <div className="w-full space-y-2">
            <Button className="w-full" variant="outline" asChild>
              <Link href={contactPhone ? `tel:${contactPhone}` : '/info'}>Contattaci</Link>
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                if (!orderNumber) return
                markHandled('cancelled', orderNumber)
                setStatus(null)
                window.close()
                router.push('/')
              }}
            >
              Chiudi pagina
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
