'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCart } from '@/lib/cart-context'
import { supabase, StoreInfo } from '@/lib/supabase'
import { validateOrderData, sanitizeOrderData } from '@/lib/validation'
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
  
  const isDelivery = searchParams.get('delivery') === 'true'
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
    discountCode: '',
    paymentMethod: 'cash' as 'cash' | 'card'
  })

  const [discountAmount, setDiscountAmount] = useState(0)
  const [verifyingDiscount, setVerifyingDiscount] = useState(false)

  useEffect(() => {
    async function fetchStoreInfo() {
      const { data, error } = await supabase
        .from('store_info')
        .select('*')
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
    if (!recaptchaSiteKey) return
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
  }, [recaptchaLoaded, recaptchaSiteKey, recaptchaWidgetId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (recaptchaLoaded) return
    const id = window.setInterval(() => {
      if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
        setRecaptchaLoaded(true)
        window.clearInterval(id)
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [recaptchaLoaded])

  useEffect(() => {
    if (!orderPlaced && items.length === 0) {
      router.push('/cart')
    }
  }, [items, orderPlaced, router])

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

  const handleVerifyDiscount = async () => {
    if (!formData.discountCode.trim()) {
      setDiscountAmount(0)
      return
    }

    setVerifyingDiscount(true)
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', formData.discountCode.toUpperCase())
        .eq('active', true)
        .single()

      if (error || !data) {
        toast.error('Codice sconto non valido')
        setDiscountAmount(0)
        return
      }

      // Check minimum order amount
      if (subtotal < data.min_order_amount) {
        toast.error(`Ordine minimo per questo sconto: ${data.min_order_amount.toFixed(2)}€`)
        setDiscountAmount(0)
        return
      }

      // Check validity dates
      const now = new Date()
      const validFrom = new Date(data.valid_from)
      const validUntil = data.valid_until ? new Date(data.valid_until) : null

      if (now < validFrom || (validUntil && now > validUntil)) {
        toast.error('Codice sconto scaduto o non ancora valido')
        setDiscountAmount(0)
        return
      }

      // Calculate discount
      let discount = 0
      if (data.discount_type === 'percentage') {
        discount = (subtotal * data.discount_value) / 100
      } else {
        discount = data.discount_value
      }

      setDiscountAmount(Math.min(discount, subtotal))
      toast.success(`Sconto applicato: ${discount.toFixed(2)}€`)
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

    if (isDelivery && !formData.address) {
      toast.error('Inserisci l\'indirizzo di consegna')
      return
    }

    if (!orderStatus.isOpen) {
      toast.error('Ordinazioni chiuse al momento')
      return
    }

    if (!recaptchaToken) {
      toast.error('Completa la verifica')
      return
    }

    // Validate input data
    const validation = validateOrderData({
      customer_name: formData.name,
      customer_phone: formData.phone,
      customer_address: formData.address,
      notes: formData.notes
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
        customer_address: isDelivery ? formData.address : null,
        notes: formData.notes
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
          quantity: item.quantity
        })),
        subtotal,
        discount_code: discountAmount > 0 ? formData.discountCode.toUpperCase() : null,
        discount_amount: discountAmount,
        delivery_fee: deliveryFee,
        total,
        status: 'pending',
        notes: formData.notes || null,
        payment_method: isDelivery ? formData.paymentMethod : null
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
      const orderNumber = data?.orderNumber as string | undefined
      if (!orderNumber) {
        throw new Error('Numero ordine mancante')
      }

      toast.success('Ordine inviato con successo!')
      setOrderPlaced(true)
      setPlacedOrderNumber(orderNumber)
      clearCart()
      router.push(`/order/${orderNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l\'invio dell\'ordine'
      toast.error(message)
      if (recaptchaWidgetId !== null && window.grecaptcha) {
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
      {recaptchaSiteKey && (
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
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <p className="font-medium">
              Ordinazioni chiuse.{nextOpenLabel ? ` Riapriamo alle ${nextOpenLabel}.` : ''}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
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
                  <div className="space-y-2">
                    <Label htmlFor="address">Indirizzo di consegna *</Label>
                    <Textarea
                      id="address"
                      placeholder="Via Roma 123, Milano"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required={isDelivery}
                    />
                  </div>
                )}

                {isDelivery && (
                  <div className="space-y-2">
                    <Label>Metodo di pagamento</Label>
                    <RadioGroup
                      value={formData.paymentMethod}
                      onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as 'cash' | 'card' })}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <label
                        htmlFor="payment-cash"
                        className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:border-primary cursor-pointer"
                      >
                        <RadioGroupItem id="payment-cash" value="cash" />
                        Contanti
                      </label>
                      <label
                        htmlFor="payment-card"
                        className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:border-primary cursor-pointer"
                      >
                        <RadioGroupItem id="payment-card" value="card" />
                        Carta (POS)
                      </label>
                    </RadioGroup>
                  </div>
                )}

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

          <div className="lg:col-span-1">
            <Card className="sticky top-20 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg sm:text-xl">Riepilogo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
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
                  {isDelivery ? 'Pagamento alla consegna: contanti o carta (POS)' : 'Pagamento in contanti al ritiro'}
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <div className="w-full space-y-3">
                  <div>
                    <Label>Verifica</Label>
                    {recaptchaSiteKey ? (
                      <>
                        <div ref={recaptchaRef} className="min-h-[78px] mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                          Completa la verifica per abilitare la conferma.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-destructive mt-2">
                        Verifica non configurata. Aggiungi `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` nelle env.
                      </p>
                    )}
                    {recaptchaSiteKey && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Debug: script {recaptchaLoaded ? 'caricato' : 'non caricato'} · grecaptcha {typeof window !== 'undefined' && window.grecaptcha ? 'presente' : 'assente'}
                      </p>
                    )}
                  </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading || !orderStatus.isOpen || !recaptchaToken}
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
