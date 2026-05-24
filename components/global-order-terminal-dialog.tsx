'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { supabase } from '@/lib/supabase'
import { normalizeOrderNumber } from '@/lib/order-number'
import { fetchPublicOrderLight } from '@/lib/public-order-client'
import { cn } from '@/lib/utils'

type TerminalStatus = 'completed' | 'cancelled' | null
const ORDER_TERMINAL_STATUS_EVENT = 'af:order-terminal-status'
const TERMINAL_STATUS_POLL_MS = 10000
const LottiePlayer = 'lottie-player' as any
const AUTO_CLOSE_MS = 1800

type FeedbackReason = {
  category: 'Food' | 'Delivery' | 'Accuratezza'
  label: string
}

const feedbackReasons: Array<{ category: FeedbackReason['category']; items: string[] }> = [
  { category: 'Food', items: ['Prodotto freddo', 'Crudo/Bruciato', 'Quantità errata'] },
  { category: 'Delivery', items: ['Ordine in ritardo', 'Consegna rovinata', 'Rider poco professionale'] },
  { category: 'Accuratezza', items: ['Prodotto sbagliato', 'Ingrediente sbagliato', 'Ingrediente mancante'] },
]

export function GlobalOrderTerminalDialog() {
  const router = useRouter()
  const [status, setStatus] = useState<TerminalStatus>(null)
  const [orderNumber, setOrderNumber] = useState<string>('')
  const [contactPhone, setContactPhone] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [selectedReasons, setSelectedReasons] = useState<FeedbackReason[]>([])
  const [feedbackState, setFeedbackState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedbackStep, setFeedbackStep] = useState<'rating' | 'reasons'>('rating')
  const closeTimerRef = useRef<number | null>(null)

  const markHandled = (nextStatus: Exclude<TerminalStatus, null>, number: string) => {
    try {
      sessionStorage.setItem(`order-terminal-dialog:${number}:${nextStatus}`, '1')
      localStorage.removeItem('lastOrderNumber')
      localStorage.removeItem('lastOrderActive')
    } catch {
      // ignore storage errors
    }
  }

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const closeTerminal = (nextStatus: Exclude<TerminalStatus, null>) => {
    clearCloseTimer()
    if (orderNumber) {
      markHandled(nextStatus, orderNumber)
    }
    setStatus(null)
  }

  const scheduleCompletedClose = () => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      closeTerminal('completed')
    }, AUTO_CLOSE_MS)
  }

  const saveFeedback = async (nextRating: number, reasons: FeedbackReason[]) => {
    if (!orderNumber) return false
    setFeedbackState('saving')

    try {
      const res = await fetch('/api/order-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          rating: nextRating,
          reasons,
        }),
      })

      if (!res.ok) throw new Error('feedback-save-failed')

      setFeedbackState('saved')
      return true
    } catch {
      setFeedbackState('error')
      return false
    }
  }

  const handleRatingClick = async (nextRating: number) => {
    setRating(nextRating)
    setSelectedReasons([])
    clearCloseTimer()

    if (nextRating <= 3) {
      setFeedbackStep('reasons')
      setFeedbackState('idle')
      return
    }

    const saved = await saveFeedback(nextRating, [])
    if (saved) scheduleCompletedClose()
  }

  const handleReasonClick = async (reason: FeedbackReason) => {
    if (!rating || rating > 3) return
    clearCloseTimer()

    const exists = selectedReasons.some(
      (item) => item.category === reason.category && item.label === reason.label
    )
    if (exists && selectedReasons.length === 1) return

    const nextReasons = exists
      ? selectedReasons.filter((item) => !(item.category === reason.category && item.label === reason.label))
      : selectedReasons.length >= 3
        ? selectedReasons
        : [...selectedReasons, reason]

    if (nextReasons === selectedReasons) return

    setSelectedReasons(nextReasons)
    const saved = await saveFeedback(rating, nextReasons)
    if (saved && nextReasons.length > 0) {
      scheduleCompletedClose()
    }
  }

  useEffect(() => {
    setRating(null)
    setSelectedReasons([])
    setFeedbackState('idle')
    setFeedbackStep('rating')
    clearCloseTimer()
  }, [status, orderNumber])

  useEffect(() => {
    return () => clearCloseTimer()
  }, [])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const isTerminalStatus = (value: string): value is Exclude<TerminalStatus, null> =>
      value === 'completed' || value === 'cancelled'

    const openIfNeeded = (nextStatus: Exclude<TerminalStatus, null>, number: string, force = false) => {
      const key = `order-terminal-dialog:${number}:${nextStatus}`
      const alreadyShown = sessionStorage.getItem(key) === '1'
      if (alreadyShown && !force) return
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
      const detail = (event as CustomEvent<{ orderNumber?: string; status?: string; force?: boolean }>)?.detail
      const number = normalizeOrderNumber(detail?.orderNumber || '')
      const nextStatus = String(detail?.status || '')
      if (!number || !isTerminalStatus(nextStatus)) return
      openIfNeeded(nextStatus, number, detail?.force === true)
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

      <Drawer
        open={status === 'completed'}
        onOpenChange={(open) => {
          if (!open && status === 'completed' && orderNumber) {
            closeTerminal('completed')
          }
        }}
      >
        <DrawerContent className="mx-auto max-h-[92vh] max-w-[480px] overflow-y-auto rounded-t-2xl">
          <div className="overflow-hidden">
            <div
              className={cn(
                'flex w-[200%] transition-transform duration-300 ease-out',
                feedbackStep === 'reasons' && '-translate-x-1/2'
              )}
            >
              <section className="w-1/2 shrink-0">
                <DrawerHeader className="px-5 pb-2 text-center">
                  <div className="mx-auto flex w-full items-center justify-center">
                    <LottiePlayer
                      src="/Complete-green.json"
                      background="transparent"
                      speed="1"
                      loop
                      autoplay
                      className="h-[120px] w-[170px] sm:h-[150px] sm:w-[210px]"
                    />
                  </div>
                  <DrawerTitle>Ordine completato</DrawerTitle>
                  <DrawerDescription>Com&apos;e&apos; andata?</DrawerDescription>
                </DrawerHeader>

                <div className="px-5 pb-2">
                  <div className="flex items-center justify-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = rating !== null && value <= rating
                      return (
                        <button
                          key={value}
                          type="button"
                          className="rounded-full p-1.5 transition-transform active:scale-95"
                          onClick={() => handleRatingClick(value)}
                          aria-label={`${value} stelle`}
                        >
                          <Star
                            className={cn(
                              'h-9 w-9 stroke-[#ffc400]',
                              active ? 'fill-[#ffc400] text-[#ffc400]' : 'fill-transparent text-[#ffc400]'
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>

                  {rating !== null && rating >= 4 && (
                    <p className="mt-5 text-center text-sm font-medium text-zinc-700">
                      Grazie, abbiamo registrato la tua recensione.
                    </p>
                  )}
                  {feedbackState === 'error' && rating !== null && rating >= 4 && (
                    <p className="mt-4 text-center text-sm font-medium text-red-600">
                      Non siamo riusciti a salvare. Riprova tra poco.
                    </p>
                  )}
                </div>
              </section>

              <section className="w-1/2 shrink-0 px-5 pb-2 pt-5">
                <div className="text-center">
                  <DrawerTitle>Cosa possiamo migliorare?</DrawerTitle>
                  <DrawerDescription className="mt-1">Seleziona fino a 3 motivi.</DrawerDescription>
                </div>

                <div className="mt-5 space-y-3">
                  {feedbackReasons.map((group) => (
                    <div key={group.category}>
                      <p className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">{group.category}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((label) => {
                          const selected = selectedReasons.some(
                            (item) => item.category === group.category && item.label === label
                          )
                          const disabled = !selected && selectedReasons.length >= 3
                          return (
                            <button
                              key={label}
                              type="button"
                              disabled={disabled || feedbackState === 'saving'}
                              onClick={() => handleReasonClick({ category: group.category, label })}
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                                selected
                                  ? 'border-zinc-950 bg-zinc-950 text-white'
                                  : 'border-zinc-200 bg-white text-zinc-800',
                                disabled && 'cursor-not-allowed opacity-45'
                              )}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {feedbackState === 'saved' && selectedReasons.length > 0 && (
                  <p className="mt-4 text-center text-sm font-medium text-zinc-700">
                    Grazie, abbiamo registrato il tuo feedback.
                  </p>
                )}
                {feedbackState === 'error' && (
                  <p className="mt-4 text-center text-sm font-medium text-red-600">
                    Non siamo riusciti a salvare. Riprova tra poco.
                  </p>
                )}
              </section>
            </div>
          </div>

          <DrawerFooter className="px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => closeTerminal('completed')}
            >
              Alla prossima
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={status === 'cancelled'}
        onOpenChange={(open) => {
          if (!open && status === 'cancelled' && orderNumber) {
            closeTerminal('cancelled')
          }
        }}
      >
        <DrawerContent className="mx-auto max-w-[480px] rounded-t-2xl">
          <DrawerHeader className="px-5 text-center">
            <div className="mx-auto flex w-full items-center justify-center">
              <LottiePlayer
                src="/cancel.json"
                background="transparent"
                speed="1"
                loop
                autoplay
                className="h-[130px] w-[180px] sm:h-[160px] sm:w-[220px]"
              />
            </div>
            <DrawerTitle>Ci dispiace, ordine annullato</DrawerTitle>
            <DrawerDescription>Contattateci se l&apos;ordine ha avuto un&apos;anomalia.</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button className="w-full" variant="outline" asChild>
              <Link href={contactPhone ? `tel:${contactPhone}` : '/info'}>Contattaci</Link>
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                closeTerminal('cancelled')
                window.close()
                router.push('/')
              }}
            >
              Chiudi pagina
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}
