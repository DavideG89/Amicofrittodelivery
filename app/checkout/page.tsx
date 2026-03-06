'use client'

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCart } from '@/lib/cart-context'
import { supabase, StoreInfo } from '@/lib/supabase'
import { validateOrderData, sanitizeOrderData } from '@/lib/validation'
import { normalizeOrderNumber } from '@/lib/order-number'
import { saveOrderToDevice } from '@/lib/order-storage'
import { toast } from 'sonner'
import { extractOpeningHours, formatNextOpen, getOrderStatus } from '@/lib/order-schedule'

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => number
      reset: (widgetId?: number) => void
    }
    recaptchaOnload?: () => void
  }
}

type CheckoutFormData = {
  name: string
  phone: string
  addressCity: string
  addressZip: string
  addressStreet: string
  addressStreetNumber: string
  addressDetails: string
  notes: string
  discountCode: string
  paymentMethod: 'cash' | 'card'
}

type DeliveryCheckState = 'idle' | 'checking' | 'inside' | 'outside' | 'unverifiable' | 'not_configured' | 'error'

type DeliveryCheckApiResponse = {
  eligible?: boolean
  mode?: DeliveryCheckState
  message?: string | null
  error?: string
}

type DeliveryCheckResult = {
  ok: boolean
  mode: DeliveryCheckState
  message: string
}

function buildDeliveryAddress(formData: CheckoutFormData) {
  const streetLine = [formData.addressStreet.trim(), formData.addressStreetNumber.trim()].filter(Boolean).join(' ')
  const cityLine = [formData.addressZip.trim(), formData.addressCity.trim()].filter(Boolean).join(' ')
  return [streetLine, formData.addressDetails.trim(), cityLine].filter(Boolean).join(', ')
}

function hasMinimumDeliveryFields(formData: CheckoutFormData) {
  return Boolean(
    formData.addressStreet.trim() &&
      formData.addressStreetNumber.trim() &&
      formData.addressZip.trim() &&
      formData.addressCity.trim()
  )
}

function CheckoutForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { items, subtotal, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [recaptchaToken, setRecaptchaToken] = useState('')
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)
  const recaptchaRef = useRef<HTMLDivElement>(null)
  const [recaptchaWidgetId, setRecaptchaWidgetId] = useState<number | null>(null)
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false)
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const disableRecaptcha =
    process.env.NEXT_PUBLIC_DISABLE_RECAPTCHA === 'true' ||
    process.env.NODE_ENV === 'development' ||
    isLocalhost
  
  const [isDelivery, setIsDelivery] = useState(searchParams.get('delivery') === 'true')
  const [orderTiming, setOrderTiming] = useState<'asap' | 'scheduled' | ''>('')
  const [scheduledTime, setScheduledTime] = useState('')
  
  const [formData, setFormData] = useState<CheckoutFormData>({
    name: '',
    phone: '',
    addressCity: 'Misilmeri',
    addressZip: '90036',
    addressStreet: '',
    addressStreetNumber: '',
    addressDetails: '',
    notes: '',
    discountCode: '',
    paymentMethod: 'cash' as 'cash' | 'card'
  })

  const [discountAmount, setDiscountAmount] = useState(0)
  const [verifyingDiscount, setVerifyingDiscount] = useState(false)
  const [deliveryCheckState, setDeliveryCheckState] = useState<DeliveryCheckState>('idle')
  const [deliveryCheckMessage, setDeliveryCheckMessage] = useState('')
  const deliveryCheckRequestIdRef = useRef(0)

  const pad = (value: number) => String(value).padStart(2, '0')
  const roundToNextQuarterHour = (date: Date) => {
    const next = new Date(date)
    next.setSeconds(0, 0)
    const remainder = next.getMinutes() % 15
    if (remainder !== 0) {
      next.setMinutes(next.getMinutes() + (15 - remainder))
    }
    return next
  }
  const timeToMinutes = (value: string) => {
    const [hoursRaw, minutesRaw] = value.split(':')
    const hours = Number(hoursRaw)
    const minutes = Number(minutesRaw)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    return hours * 60 + minutes
  }
  const minutesToTime = (value: number) => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`
  const minScheduledMinutes = (() => {
    const minDate = roundToNextQuarterHour(new Date(Date.now() + 10 * 60 * 1000))
    return minDate.getHours() * 60 + minDate.getMinutes()
  })()
  const minScheduledTime = (() => {
    return minutesToTime(minScheduledMinutes)
  })()
  const scheduledTimeOptions = useMemo(() => {
    const options: string[] = []
    for (let minutes = minScheduledMinutes; minutes <= 23 * 60 + 45; minutes += 15) {
      options.push(minutesToTime(minutes))
    }
    return options
  }, [minScheduledMinutes])
  const timingSummaryLabel =
    orderTiming === 'asap'
      ? 'Prima possibile'
      : orderTiming === 'scheduled' && scheduledTime
        ? scheduledTime
        : null
  const deliveryAddress = buildDeliveryAddress(formData)
  const hasRequiredDeliveryAddress = hasMinimumDeliveryFields(formData)

  useEffect(() => {
    async function fetchStoreInfo() {
      const { data, error } = await supabase
        .from('store_info')
        .select('id, name, address, phone, opening_hours, delivery_fee, min_order_delivery, updated_at')
        .limit(1)
        .maybeSingle()
      
      if (data && !error) {
        setStoreInfo(data)
      }
    }
    fetchStoreInfo()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!recaptchaSiteKey || disableRecaptcha) return
    const grecaptcha = window.grecaptcha
    if (!grecaptcha || typeof grecaptcha.render !== 'function') return
    if (!recaptchaRef.current) return
    if (!recaptchaLoaded) return
    if (recaptchaWidgetId !== null) return

    const id = grecaptcha.render(recaptchaRef.current, {
      sitekey: recaptchaSiteKey,
      callback: (token: string) => setRecaptchaToken(token),
    })
    setRecaptchaWidgetId(id)
  }, [disableRecaptcha, recaptchaLoaded, recaptchaSiteKey, recaptchaWidgetId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (recaptchaLoaded || disableRecaptcha) return
    const id = window.setInterval(() => {
      if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
        setRecaptchaLoaded(true)
        window.clearInterval(id)
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [disableRecaptcha, recaptchaLoaded])

  useEffect(() => {
    if (!orderPlaced && items.length === 0) {
      router.push('/cart')
    }
  }, [items, orderPlaced, router])

  useEffect(() => {
    setIsDelivery(searchParams.get('delivery') === 'true')
  }, [searchParams])

  useEffect(() => {
    if (orderTiming !== 'scheduled') return
    if (!scheduledTime) return
    if (scheduledTimeOptions.includes(scheduledTime)) return
    setScheduledTime('')
  }, [orderTiming, scheduledTime, scheduledTimeOptions])

  const verifyDeliveryAddress = useCallback(
    async (address: string): Promise<DeliveryCheckResult> => {
      const normalizedAddress = address.trim()
      if (!isDelivery) {
        setDeliveryCheckState('idle')
        setDeliveryCheckMessage('')
        return { ok: true, mode: 'idle', message: '' }
      }

      if (!normalizedAddress) {
        const message = 'Compila via, civico, CAP e comune.'
        setDeliveryCheckState('idle')
        setDeliveryCheckMessage(message)
        return { ok: false, mode: 'idle', message }
      }

      const requestId = ++deliveryCheckRequestIdRef.current
      setDeliveryCheckState('checking')
      setDeliveryCheckMessage('Verifica indirizzo in corso...')

      try {
        const response = await fetch('/api/delivery/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: normalizedAddress }),
        })

        const payload = (await response.json().catch(() => null)) as DeliveryCheckApiResponse | null
        if (requestId !== deliveryCheckRequestIdRef.current) {
          return { ok: false, mode: 'checking', message: 'Verifica indirizzo in corso...' }
        }

        if (!response.ok) {
          const message = payload?.error || 'Errore durante la verifica dell indirizzo.'
          setDeliveryCheckState('error')
          setDeliveryCheckMessage(message)
          return { ok: false, mode: 'error', message }
        }

        const mode = payload?.mode
        if (mode === 'inside' || mode === 'not_configured') {
          const message =
            payload?.message ||
            (mode === 'inside' ? 'Consegna disponibile per questo indirizzo.' : 'Verifica area non configurata.')
          setDeliveryCheckState(mode)
          setDeliveryCheckMessage(message)
          return { ok: true, mode, message }
        }

        if (mode === 'outside' || mode === 'unverifiable') {
          const message = payload?.message || 'Indirizzo non disponibile per la consegna.'
          setDeliveryCheckState(mode)
          setDeliveryCheckMessage(message)
          return { ok: false, mode, message }
        }

        const fallbackMessage = 'Risposta verifica indirizzo non valida.'
        setDeliveryCheckState('error')
        setDeliveryCheckMessage(fallbackMessage)
        return { ok: false, mode: 'error', message: fallbackMessage }
      } catch (error) {
        if (requestId !== deliveryCheckRequestIdRef.current) {
          return { ok: false, mode: 'checking', message: 'Verifica indirizzo in corso...' }
        }
        console.error('[checkout] Delivery check error:', error)
        const message = 'Errore di rete durante la verifica indirizzo.'
        setDeliveryCheckState('error')
        setDeliveryCheckMessage(message)
        return { ok: false, mode: 'error', message }
      }
    },
    [isDelivery]
  )

  useEffect(() => {
    if (!isDelivery) {
      setDeliveryCheckState('idle')
      setDeliveryCheckMessage('')
      return
    }

    if (!hasRequiredDeliveryAddress) {
      setDeliveryCheckState('idle')
      setDeliveryCheckMessage(
        formData.addressStreet.trim() ? 'Completa civico, CAP e comune per verificare la consegna.' : ''
      )
      return
    }

    const timeoutId = window.setTimeout(() => {
      void verifyDeliveryAddress(deliveryAddress)
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [isDelivery, hasRequiredDeliveryAddress, formData.addressStreet, deliveryAddress, verifyDeliveryAddress])

  const handleDeliveryAddressBlur = useCallback(() => {
    if (!isDelivery || !hasRequiredDeliveryAddress) return
    void verifyDeliveryAddress(deliveryAddress)
  }, [isDelivery, hasRequiredDeliveryAddress, verifyDeliveryAddress, deliveryAddress])

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 sm:px-6 lg:px-8 py-10 max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Ordine effettuato</CardTitle>
              <CardDescription>
                {placedOrderNumber ? `Numero ordine: ${placedOrderNumber}` : 'Stiamo preparando la pagina di conferma.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/">Torna alla home</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const deliveryFee = isDelivery ? (storeInfo?.delivery_fee || 0) : 0
  const total = subtotal + deliveryFee - discountAmount
  const { schedule } = extractOpeningHours(storeInfo?.opening_hours ?? null)
  const orderStatus = getOrderStatus(schedule)
  const nextOpenLabel = formatNextOpen(orderStatus.nextOpen)
  const deliveryCheckMessageClass =
    deliveryCheckState === 'inside' || deliveryCheckState === 'not_configured'
      ? 'text-green-600'
      : deliveryCheckState === 'checking' || deliveryCheckState === 'idle'
        ? 'text-muted-foreground'
        : 'text-destructive'

  const handleVerifyDiscount = async () => {
    if (!formData.discountCode.trim()) {
      setDiscountAmount(0)
      return
    }

    setVerifyingDiscount(true)
    try {
      const res = await fetch('/api/discounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formData.discountCode, subtotal }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data?.minOrder) {
          toast.error(`Ordine minimo per questo sconto: ${Number(data.minOrder).toFixed(2)}€`)
        } else {
          toast.error(data?.error || 'Codice sconto non valido')
        }
        setDiscountAmount(0)
        return
      }

      setDiscountAmount(Math.min(Number(data.discountAmount || 0), subtotal))
      toast.success(`Sconto applicato: ${Number(data.discountAmount || 0).toFixed(2)}€`)
    } catch (err) {
      console.error('[v0] Error verifying discount:', err)
      toast.error('Errore durante la verifica del codice sconto')
      setDiscountAmount(0)
    } finally {
      setVerifyingDiscount(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.phone) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    if (isDelivery) {
      if (
        !formData.addressStreet.trim() ||
        !formData.addressStreetNumber.trim() ||
        !formData.addressZip.trim() ||
        !formData.addressCity.trim()
      ) {
        toast.error('Compila via, civico, CAP e comune per la consegna')
        return
      }

      if (!deliveryAddress) {
        toast.error('Indirizzo di consegna non valido')
        return
      }

      if (deliveryCheckState === 'checking') {
        toast.error('Attendi il completamento della verifica indirizzo')
        return
      }

      if (deliveryCheckState === 'outside' || deliveryCheckState === 'unverifiable' || deliveryCheckState === 'error') {
        toast.error(deliveryCheckMessage || 'Indirizzo non coperto dalla consegna')
        return
      }

      if (deliveryCheckState === 'idle') {
        const checkResult = await verifyDeliveryAddress(deliveryAddress)
        if (!checkResult.ok) {
          toast.error(checkResult.message || 'Indirizzo non coperto dalla consegna')
          return
        }
      }
    }

    if (!orderTiming) {
      toast.error('Seleziona l\'orario prima di confermare')
      return
    }

    if (orderTiming === 'scheduled') {
      if (scheduledTimeOptions.length === 0) {
        toast.error('Nessuno slot disponibile oggi')
        return
      }

      if (!scheduledTime) {
        toast.error('Seleziona un orario')
        return
      }

      if (!scheduledTimeOptions.includes(scheduledTime)) {
        toast.error('Seleziona uno degli slot disponibili')
        return
      }

      const selectedMinutes = timeToMinutes(scheduledTime)
      if (selectedMinutes === null || selectedMinutes < minScheduledMinutes) {
        toast.error(`Scegli un orario dopo le ${minScheduledTime}`)
        return
      }
    }

    if (!orderStatus.isOpen) {
      toast.error('Ordinazioni chiuse al momento')
      return
    }

    if (!disableRecaptcha && !recaptchaToken) {
      toast.error('Completa la verifica')
      return
    }

    const requestedTimeLine =
      orderTiming === 'asap'
        ? `Orario ${isDelivery ? 'consegna' : 'ritiro'}: prima possibile`
        : `Orario ${isDelivery ? 'consegna' : 'ritiro'}: ${scheduledTime}`
    const combinedNotes = [requestedTimeLine, formData.notes?.trim() || ''].filter(Boolean).join('\n').slice(0, 1000)

    // Validate input data
    const validation = validateOrderData({
      customer_name: formData.name,
      customer_phone: formData.phone,
      customer_address: isDelivery ? deliveryAddress : '',
      notes: combinedNotes
    })

    if (!validation.valid) {
      toast.error(validation.errors[0])
      return
    }

    setLoading(true)
    try {
      // Sanitize user input
      const sanitizedData = sanitizeOrderData({
        customer_name: formData.name,
        customer_phone: formData.phone,
        customer_address: isDelivery ? deliveryAddress : null,
        notes: combinedNotes
      })

      const orderData = {
        customer_name: sanitizedData.customer_name,
        customer_phone: sanitizedData.customer_phone,
        customer_address: sanitizedData.customer_address,
        order_type: isDelivery ? 'delivery' : 'takeaway',
        items: items.map(item => ({
          product_id: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          piece_option_id: item.piece_option_id || null,
          additions: item.additions?.trim() ? item.additions.trim() : null,
          additions_unit_price:
            Number.isFinite(Number(item.additions_unit_price)) && Number(item.additions_unit_price) > 0
              ? Number(item.additions_unit_price)
              : 0,
          additions_ids: Array.isArray(item.additions_ids) ? item.additions_ids : [],
        })),
        subtotal,
        discount_code: discountAmount > 0 ? formData.discountCode.toUpperCase() : null,
        discount_amount: discountAmount,
        delivery_fee: deliveryFee,
        total,
        status: 'pending',
        notes: sanitizedData.notes,
        payment_method: formData.paymentMethod,
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recaptchaToken,
          order: orderData,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const details = data?.details
        if (Array.isArray(details) && details.includes('timeout-or-duplicate')) {
          throw new Error('Verifica scaduta. Ripeti il captcha.')
        }
        throw new Error(data?.error || 'Ordine rifiutato')
      }

      const data = await res.json()
      const orderNumber = normalizeOrderNumber(data?.orderNumber)
      if (!orderNumber) {
        throw new Error('Numero ordine mancante')
      }

      toast.success('Ordine inviato con successo!')
      try {
        localStorage.setItem('lastOrderNumber', orderNumber)
        localStorage.setItem('lastOrderActive', 'true')
      } catch {
        // ignore storage errors
      }
      saveOrderToDevice(orderNumber, isDelivery ? 'delivery' : 'takeaway')
      setOrderPlaced(true)
      setPlacedOrderNumber(orderNumber)
      clearCart()
      router.push(`/order/${encodeURIComponent(orderNumber)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l\'invio dell\'ordine'
      toast.error(message)
      if (!disableRecaptcha && recaptchaWidgetId !== null && window.grecaptcha) {
        window.grecaptcha.reset(recaptchaWidgetId)
        setRecaptchaToken('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <Header />
      {recaptchaSiteKey && !disableRecaptcha && (
        <Script
          src="https://www.google.com/recaptcha/api.js?render=explicit&onload=recaptchaOnload"
          strategy="afterInteractive"
          onLoad={() => {
            window.recaptchaOnload = () => setRecaptchaLoaded(true)
            if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
              setRecaptchaLoaded(true)
            }
          }}
        />
      )}
      
      <main className="container px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
        <div className="mb-6 space-y-3">
          <Button variant="ghost" asChild className="-ml-3">
            <Link href="/cart">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna al carrello
            </Link>
          </Button>
          
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Checkout</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isDelivery ? 'Consegna a domicilio' : 'Ritiro in negozio'}
            </p>
          </div>
        </div>

        {!orderStatus.isOpen && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-center">
            <p className="font-medium">
              Ordinazioni chiuse.{nextOpenLabel ? ` Riapriamo ${nextOpenLabel}.` : ''}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg sm:text-xl">Dati del cliente</CardTitle>
                <CardDescription className="text-sm">Inserisci i tuoi dati per completare l'ordine</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome e Cognome *</Label>
                  <Input
                    id="name"
                    placeholder="Mario Rossi"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+39 123 456 7890"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                {isDelivery && (
                  <div className="space-y-3">
                    <Label>Indirizzo di consegna *</Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="address-street">Via/Piazza *</Label>
                        <Input
                          id="address-street"
                          placeholder="Corso Vittorio Emanuele"
                          value={formData.addressStreet}
                          onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                          onBlur={handleDeliveryAddressBlur}
                          required={isDelivery}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-number">Numero civico *</Label>
                        <Input
                          id="address-number"
                          placeholder="12"
                          value={formData.addressStreetNumber}
                          onChange={(e) => setFormData({ ...formData, addressStreetNumber: e.target.value })}
                          onBlur={handleDeliveryAddressBlur}
                          required={isDelivery}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-zip">CAP *</Label>
                        <Input
                          id="address-zip"
                          placeholder="90036"
                          value={formData.addressZip}
                          onChange={(e) => setFormData({ ...formData, addressZip: e.target.value })}
                          onBlur={handleDeliveryAddressBlur}
                          required={isDelivery}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="address-city">Comune *</Label>
                        <Input
                          id="address-city"
                          placeholder="Misilmeri"
                          value={formData.addressCity}
                          onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                          onBlur={handleDeliveryAddressBlur}
                          required={isDelivery}
                        />
                        {(deliveryCheckState === 'checking' || Boolean(deliveryCheckMessage)) && (
                          <p className={`text-xs ${deliveryCheckMessageClass}`}>
                            {deliveryCheckState === 'checking' ? 'Verifica indirizzo in corso...' : deliveryCheckMessage}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="address-details">Scala / Interno (opzionale)</Label>
                        <Input
                          id="address-details"
                          placeholder="Scala B, Interno 3"
                          value={formData.addressDetails}
                          onChange={(e) => setFormData({ ...formData, addressDetails: e.target.value })}
                        />
                      </div>
                    </div>
                    {deliveryAddress && (
                      <p className="text-xs text-muted-foreground">
                        Indirizzo completo: {deliveryAddress}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <Label>Orario {isDelivery ? 'consegna' : 'ritiro'} *</Label>
                  <RadioGroup
                    value={orderTiming}
                    onValueChange={(value) => setOrderTiming(value as 'asap' | 'scheduled')}
                    className="grid gap-2"
                  >
                    <label
                      htmlFor="timing-asap"
                      className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:border-primary cursor-pointer"
                    >
                      <RadioGroupItem id="timing-asap" value="asap" />
                      Prima possibile
                    </label>
                    <label
                      htmlFor="timing-scheduled"
                      className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:border-primary cursor-pointer"
                    >
                      <RadioGroupItem id="timing-scheduled" value="scheduled" />
                      Programma orario
                    </label>
                  </RadioGroup>
                  {orderTiming === 'scheduled' && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduled-time">Orario desiderato *</Label>
                      <Select value={scheduledTime} onValueChange={setScheduledTime} disabled={scheduledTimeOptions.length === 0}>
                        <SelectTrigger id="scheduled-time">
                          <SelectValue placeholder="Seleziona un orario" />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduledTimeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Slot da 15 minuti ({`00, 15, 30, 45`}) · minimo: {minScheduledTime}
                      </p>
                      {scheduledTimeOptions.length === 0 && (
                        <p className="text-xs text-destructive">Nessuno slot disponibile oggi.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Metodo di pagamento</Label>
                  <RadioGroup
                    value={formData.paymentMethod}
                    onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as 'cash' | 'card' })}
                    className="grid grid-cols-2 gap-2"
                  >
                    <label
                      htmlFor="payment-cash"
                      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-sm font-medium cursor-pointer transition-colors ${
                        formData.paymentMethod === 'cash'
                          ? 'border-primary bg-primary/15 text-foreground'
                          : 'hover:border-primary'
                      }`}
                    >
                      <RadioGroupItem id="payment-cash" value="cash" className="sr-only" />
                      <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center">
                        {formData.paymentMethod === 'cash' && (
                          <Image
                            src="/Star.svg"
                            alt=""
                            aria-hidden="true"
                            width={56}
                            height={56}
                            className="pointer-events-none absolute h-16 w-16 -rotate-[15deg] opacity-90"
                          />
                        )}
                        <Image
                          src="/cash-payment.png"
                          alt=""
                          aria-hidden="true"
                          width={40}
                          height={40}
                          className={`relative z-10 h-12 w-12 transition-transform duration-200 ${
                            formData.paymentMethod === 'cash' ? 'rotate-[20deg]' : 'rotate-0'
                          }`}
                        />
                      </span>
                      <span>Contanti</span>
                    </label>
                    <label
                      htmlFor="payment-card"
                      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-sm font-medium cursor-pointer transition-colors ${
                        formData.paymentMethod === 'card'
                          ? 'border-primary bg-primary/15 text-foreground'
                          : 'hover:border-primary'
                      }`}
                    >
                      <RadioGroupItem id="payment-card" value="card" className="sr-only" />
                      <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center">
                        {formData.paymentMethod === 'card' && (
                          <Image
                            src="/Star.svg"
                            alt=""
                            aria-hidden="true"
                            width={56}
                            height={56}
                            className="pointer-events-none absolute h-14 w-14 -rotate-[15deg] opacity-90"
                          />
                        )}
                        <Image
                          src="/payment.png"
                          alt=""
                          aria-hidden="true"
                          width={40}
                          height={40}
                          className={`relative z-10 h-12 w-12 transition-transform duration-200 ${
                            formData.paymentMethod === 'card' ? 'rotate-[20deg]' : 'rotate-0'
                          }`}
                        />
                      </span>
                      <span>Carta (POS)</span>
                    </label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Note (opzionale)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Citofono, piano, preferenze..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Codice sconto</CardTitle>
                <CardDescription>Hai un codice sconto? Inseriscilo qui</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="SCONTO10"
                    value={formData.discountCode}
                    onChange={(e) => setFormData({ ...formData, discountCode: e.target.value.toUpperCase() })}
                    onBlur={handleVerifyDiscount}
                  />
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={handleVerifyDiscount}
                    disabled={verifyingDiscount}
                  >
                    {verifyingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Applica'}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="lg:col-span-2">
            <Card className="sticky top-20 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg sm:text-xl">Riepilogo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {timingSummaryLabel && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Orario</span>
                      <span className="font-medium">{timingSummaryLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotale</span>
                    <span className="font-medium">{subtotal.toFixed(2)}€</span>
                  </div>
                  
                  {isDelivery && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Consegna</span>
                      <span className="font-medium">{deliveryFee.toFixed(2)}€</span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 font-medium">
                      <span>Sconto applicato</span>
                      <span>-{discountAmount.toFixed(2)}€</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between font-bold text-lg sm:text-xl">
                    <span>Totale</span>
                    <span className="text-primary">{total.toFixed(2)}€</span>
                  </div>
                </div>

                <div className="text-xs sm:text-sm text-muted-foreground bg-muted p-3 rounded-md leading-relaxed">
                  {isDelivery
                    ? 'Pagamento alla consegna: contanti o carta (POS)'
                    : 'Pagamento al ritiro: contanti o carta (POS)'}
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <div className="w-full space-y-3">
                  <div>
                    <Label>Verifica</Label>
                    {recaptchaSiteKey && !disableRecaptcha ? (
                      <>
                        <div className="mt-2 max-w-full overflow-hidden">
                          <div ref={recaptchaRef} className="min-h-[78px] origin-left scale-95 transform" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Completa la verifica per abilitare la conferma.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-destructive mt-2">
                        Verifica non configurata. Aggiungi `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` nelle env.
                      </p>
                    )}
                    {recaptchaSiteKey && !disableRecaptcha && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Debug: script {recaptchaLoaded ? 'caricato' : 'non caricato'} · grecaptcha {typeof window !== 'undefined' && window.grecaptcha ? 'presente' : 'assente'}
                      </p>
                    )}
                  </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={
                    loading ||
                    !orderStatus.isOpen ||
                    !orderTiming ||
                    (orderTiming === 'scheduled' && !scheduledTime) ||
                    (isDelivery && deliveryCheckState === 'checking') ||
                    (!disableRecaptcha && !recaptchaToken)
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Invio in corso...
                    </>
                  ) : (
                    'Conferma ordine'
                  )}
                </Button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </form>
      </main>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <CheckoutForm />
    </Suspense>
  )
}
