'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'

type TerminalStatus = 'completed' | 'cancelled' | null

export function GlobalOrderTerminalDialog() {
  const router = useRouter()
  const [status, setStatus] = useState<TerminalStatus>(null)
  const [orderNumber, setOrderNumber] = useState<string>('')
  const [contactPhone, setContactPhone] = useState<string | null>(null)

  const markHandled = (nextStatus: Exclude<TerminalStatus, null>, number: string) => {
    try {
      sessionStorage.setItem(`order-terminal-dialog:${number}:${nextStatus}`, '1')
      localStorage.setItem('lastOrderActive', 'false')
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    let cancelled = false

    const checkTerminalStatus = async () => {
      try {
        const number = localStorage.getItem('lastOrderNumber') || ''
        if (!number) return

        const { data, error } = await supabase
          .from('orders_public')
          .select('status')
          .eq('order_number', number)
          .single()

        if (cancelled || error || !data?.status) return
        const current = String(data.status)
        if (current !== 'completed' && current !== 'cancelled') return

        const key = `order-terminal-dialog:${number}:${current}`
        const alreadyShown = sessionStorage.getItem(key) === '1'
        if (alreadyShown) return

        setOrderNumber(number)
        setStatus(current as Exclude<TerminalStatus, null>)
      } catch {
        // ignore polling errors
      }
    }

    const id = window.setInterval(checkTerminalStatus, 30000)
    void checkTerminalStatus()

    return () => {
      cancelled = true
      window.clearInterval(id)
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
      <Dialog
        open={status === 'completed'}
        onOpenChange={(open) => {
          if (!open && status === 'completed' && orderNumber) {
            markHandled('completed', orderNumber)
            setStatus(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ordine completato</DialogTitle>
            <DialogDescription>Grazie :)</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ci dispiace, ordine annullato</DialogTitle>
            <DialogDescription>Contattateci se l&apos;ordine ha avuto un&apos;anomalia.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href={contactPhone ? `tel:${contactPhone}` : '/info'}>Contattaci</Link>
            </Button>
            <Button
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

