'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Plus, Minus, Trash2, ShoppingBag, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { getCartItemKey, useCart } from '@/lib/cart-context'
import { formatRemovedIngredientsLabel } from '@/lib/ingredient-removals'
import { normalizeOrderNumber } from '@/lib/order-number'
import { StoreInfo, OrderStatus } from '@/lib/supabase'
import { extractOpeningHours, formatNextOpen, getOrderStatus } from '@/lib/order-schedule'
import { fetchPublicOrderLight } from '@/lib/public-order-client'
import { subscribeToStoreInfo } from '@/lib/store-info-sync'

const DISCOUNT_MIN_ORDER = 6

export default function CartPage() {
  const router = useRouter()
  const { items, updateQuantity, removeItem, clearCart, subtotal } = useCart()
  const [isDelivery, setIsDelivery] = useState(false)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderActive, setLastOrderActive] = useState(false)
  const [lastOrderStatus, setLastOrderStatus] = useState<OrderStatus | null>(null)
  const [lastOrderLoading, setLastOrderLoading] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [verifyingDiscount, setVerifyingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState('')
  const [discountAppliedSubtotal, setDiscountAppliedSubtotal] = useState<number | null>(null)
  const [clearCartDrawerOpen, setClearCartDrawerOpen] = useState(false)
  const [redirectingHome, setRedirectingHome] = useState(false)
  const selectedOrderType = isDelivery ? 'delivery' : 'takeaway'

  useEffect(() => {
    const unsubscribe = subscribeToStoreInfo({
      onUpdate: (nextStoreInfo) => {
        setStoreInfo(nextStoreInfo)
      },
      onError: (error) => {
        console.error('[cart] Store info sync error:', error)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    try {
      const number = normalizeOrderNumber(localStorage.getItem('lastOrderNumber'))
      const active = localStorage.getItem('lastOrderActive') === 'true'
      setLastOrderNumber(number || null)
      setLastOrderActive(active)
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (!lastOrderNumber) return
    let cancelled = false
    const refreshStatus = async () => {
      setLastOrderLoading(true)
      try {
        const data = await fetchPublicOrderLight(lastOrderNumber)
        if (cancelled) return
        const status = (data?.status as OrderStatus) || null
        setLastOrderStatus(status)
        if (status) {
          const active = status !== 'completed' && status !== 'cancelled'
          setLastOrderActive(active)
          try {
            localStorage.setItem('lastOrderActive', active ? 'true' : 'false')
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        if (cancelled) return
        setLastOrderStatus(null)
      } finally {
        if (cancelled) return
        setLastOrderLoading(false)
      }
    }

    void refreshStatus()

    return () => {
      cancelled = true
    }
  }, [lastOrderNumber])

  useEffect(() => {
    if (items.length > 0) return
    setDiscountCode('')
    setDiscountAmount(0)
    setDiscountError('')
    setDiscountAppliedSubtotal(null)
  }, [items.length])

  useEffect(() => {
    if (!discountCode.trim()) return
    if (subtotal >= DISCOUNT_MIN_ORDER) return
    setDiscountAmount(0)
    setDiscountAppliedSubtotal(null)
    setDiscountError(`Ordine minimo per applicare un codice sconto: ${DISCOUNT_MIN_ORDER.toFixed(2)}€`)
  }, [discountCode, subtotal])

  useEffect(() => {
    if (discountAppliedSubtotal === null || discountAmount <= 0) return
    if (Math.abs(discountAppliedSubtotal - subtotal) < 0.01) return
    setDiscountAmount(0)
    setDiscountAppliedSubtotal(null)
    setDiscountError('Carrello aggiornato: riapplica il codice sconto.')
  }, [discountAmount, discountAppliedSubtotal, subtotal])

  useEffect(() => {
    if (!discountCode.trim()) return
    setDiscountAmount(0)
    setDiscountAppliedSubtotal(null)
    setDiscountError('Modalita ordine cambiata: riapplica il codice sconto.')
  }, [selectedOrderType])

  const deliveryFee = isDelivery ? (storeInfo?.delivery_fee || 0) : 0
  const total = subtotal + deliveryFee - discountAmount

  const { schedule } = extractOpeningHours(storeInfo?.opening_hours ?? null)
  const orderStatus = getOrderStatus(schedule)
  const nextOpenLabel = formatNextOpen(orderStatus.nextOpen)

  const hasActiveOrder =
    Boolean(lastOrderNumber) &&
    (lastOrderLoading ||
      lastOrderActive ||
      (lastOrderStatus !== null &&
        lastOrderStatus !== 'completed' &&
        lastOrderStatus !== 'cancelled'))

  const canProceed =
    items.length > 0 &&
    orderStatus.isOpen &&
    !hasActiveOrder &&
    (!isDelivery || (storeInfo && subtotal >= storeInfo.min_order_delivery))

  const clearCartAndGoHome = () => {
    setRedirectingHome(true)
    clearCart()
    router.replace('/')
  }

  const handleCheckout = () => {
    if (!canProceed) return
    const checkoutParams = new URLSearchParams()
    checkoutParams.set('delivery', String(isDelivery))
    if (discountAmount > 0 && discountCode.trim()) {
      checkoutParams.set('discountCode', discountCode.trim().toUpperCase())
      checkoutParams.set('discountAmount', discountAmount.toFixed(2))
    }
    router.push(`/checkout?${checkoutParams.toString()}`)
  }

  const handleClearCart = () => {
    if (items.length === 0) return
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    if (isDesktop) {
      const confirmed = window.confirm('Vuoi svuotare completamente il carrello?')
      if (!confirmed) return
      clearCartAndGoHome()
      return
    }
    setClearCartDrawerOpen(true)
  }

  const handleConfirmClearCart = () => {
    setClearCartDrawerOpen(false)
    clearCartAndGoHome()
  }

  const handleVerifyDiscount = async () => {
    const normalizedCode = discountCode.trim().toUpperCase()
    if (!normalizedCode) {
      setDiscountAmount(0)
      setDiscountAppliedSubtotal(null)
      setDiscountError('')
      return
    }

    if (subtotal < DISCOUNT_MIN_ORDER) {
      setDiscountAmount(0)
      setDiscountAppliedSubtotal(null)
      setDiscountError(`Ordine minimo per applicare un codice sconto: ${DISCOUNT_MIN_ORDER.toFixed(2)}€`)
      return
    }

    setVerifyingDiscount(true)
    try {
      const res = await fetch('/api/discounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizedCode, subtotal, orderType: selectedOrderType }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setDiscountAmount(0)
        setDiscountAppliedSubtotal(null)
        if (data?.minOrder) {
          setDiscountError(`Ordine minimo per questo sconto: ${Number(data.minOrder).toFixed(2)}€`)
        } else {
          setDiscountError(data?.error || 'Codice sconto non valido')
        }
        return
      }

      const nextAmount = Math.min(Number(data?.discountAmount || 0), subtotal)
      if (nextAmount <= 0) {
        setDiscountAmount(0)
        setDiscountAppliedSubtotal(null)
        setDiscountError('Codice sconto non valido')
        return
      }

      setDiscountCode(String(data?.discountCode || normalizedCode).toUpperCase())
      setDiscountAmount(nextAmount)
      setDiscountAppliedSubtotal(subtotal)
      setDiscountError('')
    } catch (err) {
      console.error('[v0] Error verifying discount from cart:', err)
      setDiscountAmount(0)
      setDiscountAppliedSubtotal(null)
      setDiscountError('Errore durante la verifica del codice sconto')
    } finally {
      setVerifyingDiscount(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      <Header />
      
      <main className="container px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
        <div className="mb-6 space-y-3">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna al menu
          </Link>
          <Button variant="ghost" asChild className="-ml-3 hidden md:inline-flex">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna al menu
            </Link>
          </Button>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Il tuo carrello</h1>
              {items.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {items.length} {items.length === 1 ? 'articolo' : 'articoli'}
                </p>
              )}
            </div>
            {items.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearCart}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                aria-label="Svuota carrello"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Svuota carrello
              </Button>
            )}
          </div>
        </div>

        {!orderStatus.isOpen && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-center">
            <p className="font-medium">
              Ordinazioni chiuse.{nextOpenLabel ? ` Riapriamo ${nextOpenLabel}.` : ''}
            </p>
          </div>
        )}

        {hasActiveOrder && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">
                Hai già un ordine in corso. Attendi il completamento dell&apos;ordine precedente
                {lastOrderNumber ? (
                  <>
                    {' '}
                    (codice <span className="font-mono">{lastOrderNumber}</span>).
                  </>
                ) : (
                  '.'
                )}
              </p>
              {lastOrderNumber && (
                <Button asChild size="sm" variant="outline" className="border-amber-300 text-amber-900">
                  <Link href={`/order/${encodeURIComponent(lastOrderNumber)}`}>Traccia ordine</Link>
                </Button>
              )}
            </div>
            {lastOrderLoading && (
              <p className="text-sm text-amber-800 mt-1">Verifica ordine in corso...</p>
            )}
          </div>
        )}

        {items.length === 0 && !redirectingHome ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Il carrello è vuoto</h2>
              <p className="text-muted-foreground mb-6">Aggiungi prodotti per iniziare il tuo ordine</p>
              <Button asChild className="hidden md:inline-flex">
                <Link href="/">Vai al menu</Link>
              </Button>
            </CardContent>
          </Card>
        ) : !redirectingHome ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
              {items.map((item) => {
                const removedIngredientsLabel = formatRemovedIngredientsLabel(
                  Array.isArray(item.removed_ingredients) ? item.removed_ingredients : []
                )

                return (
                  <Card key={getCartItemKey(item)} className="overflow-hidden">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex gap-3 sm:gap-4">
                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-md overflow-hidden flex-shrink-0">
                          {item.product.image_url ? (
                            <Image
                              src={item.product.image_url}
                              alt={item.product.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 80px, 96px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                              No img
                            </div>
                          )}
                        </div>

                        <div className="flex-grow min-w-0">
                          <h3 className="font-semibold text-base sm:text-lg truncate">{item.product.name}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {(item.product.price + (item.additions_unit_price || 0)).toFixed(2)}€ cad.
                            {(item.additions_unit_price || 0) > 0 && (
                              <span> (base {item.product.price.toFixed(2)}€ + extra {(item.additions_unit_price || 0).toFixed(2)}€)</span>
                            )}
                          </p>
                          {removedIngredientsLabel && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {removedIngredientsLabel}
                            </p>
                          )}
                          {item.additions && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.additions}
                            </p>
                          )}

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
                            <div className="flex items-center border rounded-md bg-background">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:h-9 sm:w-9"
                                onClick={() => updateQuantity(getCartItemKey(item), item.quantity - 1)}
                              >
                                <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </Button>
                              <span className="w-10 text-center font-medium text-sm">{item.quantity}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:h-9 sm:w-9"
                                onClick={() => updateQuantity(getCartItemKey(item), item.quantity + 1)}
                              >
                                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                              <span className="font-bold text-lg sm:text-xl text-primary">
                                {((item.product.price + (item.additions_unit_price || 0)) * item.quantity).toFixed(2)}€
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:bg-destructive/10"
                                onClick={() => removeItem(getCartItemKey(item))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-20 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg sm:text-xl">Riepilogo ordine</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                    <div className="space-y-1">
                      <Label htmlFor="delivery-mode" className="cursor-pointer font-medium text-sm">
                        Modalità ordine
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {isDelivery ? 'Consegna a domicilio' : 'Ritiro in negozio'}
                      </p>
                    </div>
                    <Switch
                      id="delivery-mode"
                      checked={isDelivery}
                      onCheckedChange={setIsDelivery}
                    />
                  </div>

                  {isDelivery && storeInfo && subtotal < storeInfo.min_order_delivery && (
                    <div className="text-xs sm:text-sm text-destructive bg-destructive/10 p-3 rounded-md leading-relaxed">
                      Ordine minimo per la consegna: <strong>{storeInfo.min_order_delivery.toFixed(2)}€</strong>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="cart-discount-code" className="text-sm">
                      Codice sconto
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="cart-discount-code"
                        placeholder="SCONTO10"
                        value={discountCode}
                        onChange={(e) => {
                          const nextCode = e.target.value.toUpperCase()
                          setDiscountCode(nextCode)
                          setDiscountAmount(0)
                          setDiscountAppliedSubtotal(null)
                          if (!nextCode.trim()) {
                            setDiscountError('')
                            return
                          }
                          if (subtotal < DISCOUNT_MIN_ORDER) {
                            setDiscountError(`Ordine minimo per applicare un codice sconto: ${DISCOUNT_MIN_ORDER.toFixed(2)}€`)
                            return
                          }
                          setDiscountError('')
                        }}
                        onBlur={() => {
                          if (!discountCode.trim()) return
                          void handleVerifyDiscount()
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleVerifyDiscount()}
                        disabled={verifyingDiscount}
                      >
                        {verifyingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Applica'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ordine minimo per usare lo sconto: {DISCOUNT_MIN_ORDER.toFixed(2)}€
                    </p>
                    {discountError && (
                      <p className="text-xs sm:text-sm text-red-600 font-medium">{discountError}</p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotale</span>
                      <span className="font-medium">{subtotal.toFixed(2)}€</span>
                    </div>
                    
                    {isDelivery && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Costo consegna</span>
                        <span className="font-medium">{deliveryFee.toFixed(2)}€</span>
                      </div>
                    )}

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-medium">
                        <span>Sconto ({discountCode.trim().toUpperCase()})</span>
                        <span>-{discountAmount.toFixed(2)}€</span>
                      </div>
                    )}

                    <Separator />

                    <div className="flex justify-between font-bold text-lg sm:text-xl">
                      <span>Totale</span>
                      <span className="text-primary">{total.toFixed(2)}€</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button 
                    className="w-full" 
                    size="lg"
                    disabled={!canProceed}
                    onClick={handleCheckout}
                    aria-label="Procedi al checkout"
                  >
                    Procedi al checkout
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        ) : null}
      </main>

      <Drawer open={clearCartDrawerOpen} onOpenChange={setClearCartDrawerOpen}>
        <DrawerContent className="md:hidden">
          <DrawerHeader>
            <DrawerTitle>Sei sicuro di eliminare?</DrawerTitle>
            <DrawerDescription>
              Questa azione rimuoverà tutti i prodotti dal carrello.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmClearCart}
            >
              Sono sicuro
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearCartDrawerOpen(false)}
            >
              Annulla
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
