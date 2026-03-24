'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, Minus, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useIsMobile } from '@/components/ui/use-mobile'
import { getCartItemKey, useCart } from '@/lib/cart-context'
import { buildProductNameWithPieceOption, normalizeProductPieceOptions } from '@/lib/product-piece-options'
import { isIngredientRemovalEnabledForCategory, parseIngredientList } from '@/lib/ingredient-removals'
import { Product, supabase, OrderAddition } from '@/lib/supabase'
import { DEFAULT_SAUCE_RULE, getFallbackSauceRuleByCategorySlug, normalizeSauceRule, SauceRule } from '@/lib/sauce-rules'
import { toast } from 'sonner'

type ProductCardProps = {
  product: Product
  onAddToCart?: (product: Product, quantity: number) => void
  imageFit?: 'cover' | 'contain'
  skipAdditions?: boolean
  categorySlug?: string | null
  categoryName?: string | null
  saucesOnly?: boolean
  forceFreeSingleSauce?: boolean
}

export function ProductCard({
  product,
  onAddToCart,
  imageFit = 'cover',
  skipAdditions = false,
  categorySlug,
  categoryName,
  saucesOnly = false,
  forceFreeSingleSauce = false,
}: ProductCardProps) {
  const { addItem, items, updateQuantity } = useCart()
  const isMobile = useIsMobile()
  const [details, setDetails] = useState<{
    description?: string | null
    ingredients?: string | null
    allergens?: string | null
  } | null>(() => {
    if (product.description || product.ingredients || product.allergens) {
      return {
        description: product.description ?? null,
        ingredients: product.ingredients ?? null,
        allergens: product.allergens ?? null,
      }
    }
    return null
  })
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [additionsOpen, setAdditionsOpen] = useState(false)
  const [sauceOptions, setSauceOptions] = useState<OrderAddition[]>([])
  const [extraOptions, setExtraOptions] = useState<OrderAddition[]>([])
  const [saucesLoading, setSaucesLoading] = useState(false)
  const [sauceRule, setSauceRule] = useState<SauceRule>(DEFAULT_SAUCE_RULE)
  const [selectedSauceIds, setSelectedSauceIds] = useState<Set<string>>(new Set())
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set())
  const [selectedRemovedIngredients, setSelectedRemovedIngredients] = useState<Set<string>>(new Set())
  const [selectedPieceOptionId, setSelectedPieceOptionId] = useState('')
  
  const pieceOptions = normalizeProductPieceOptions(product.piece_options)
  const hasPieceOptions = pieceOptions.length > 0
  const removableIngredientOptions = parseIngredientList(details?.ingredients ?? product.ingredients ?? null)
  const canRemoveIngredients = isIngredientRemovalEnabledForCategory(categorySlug, categoryName)
  const productCartItems = items.filter(item => item.product.id === product.id)
  const inCartQuantity = productCartItems.reduce((sum, item) => sum + item.quantity, 0)
  const effectiveSauceRule: SauceRule = forceFreeSingleSauce ? DEFAULT_SAUCE_RULE : sauceRule

  const loadSauces = async () => {
    if (sauceOptions.length > 0 || saucesLoading) return
    setSaucesLoading(true)
    try {
      const { data } = await supabase
        .from('order_additions')
        .select('id, type, name, price, active, display_order, created_at, updated_at')
        .eq('active', true)
        .order('display_order', { ascending: true })

      const additions = (data || []) as OrderAddition[]
      setSauceOptions(additions.filter((item) => item.type === 'sauce'))
      setExtraOptions(saucesOnly ? [] : additions.filter((item) => item.type === 'extra'))
    } catch {
      setSauceOptions([])
      setExtraOptions([])
    } finally {
      setSaucesLoading(false)
    }
  }

  const loadSauceRule = async () => {
    if (forceFreeSingleSauce) {
      setSauceRule(DEFAULT_SAUCE_RULE)
      return
    }
    const slug = (categorySlug || '').trim().toLowerCase()
    if (!slug) {
      setSauceRule(DEFAULT_SAUCE_RULE)
      return
    }
    try {
      const { data, error } = await supabase
        .from('order_addition_category_rules')
        .select('sauce_mode, max_sauces, sauce_price')
        .eq('category_slug', slug)
        .eq('active', true)
        .limit(1)
        .maybeSingle()

      if (error || !data) {
        setSauceRule(getFallbackSauceRuleByCategorySlug(slug))
        return
      }
      setSauceRule(normalizeSauceRule(data as Partial<SauceRule>))
    } catch {
      setSauceRule(getFallbackSauceRuleByCategorySlug(slug))
    }
  }

  const handleOpenAdditions = async () => {
    if (skipAdditions && !hasPieceOptions) {
      addItem(product)
      if (onAddToCart) onAddToCart(product, 1)
      return
    }
    setSelectedSauceIds(new Set())
    setSelectedExtras(new Set())
    setSelectedRemovedIngredients(new Set())
    setSelectedPieceOptionId(pieceOptions.length === 1 ? pieceOptions[0].id : '')
    setAdditionsOpen(true)
    await Promise.all([loadSauces(), loadSauceRule()])
  }

  const toggleSauce = (sauceId: string, checked: boolean) => {
    setSelectedSauceIds((prev) => {
      if (effectiveSauceRule.sauce_mode === 'none') return new Set()

      if (effectiveSauceRule.sauce_mode === 'free_single') {
        if (!checked) return new Set()
        return new Set([sauceId])
      }

      const next = new Set(prev)
      if (checked) {
        if (!next.has(sauceId) && next.size >= effectiveSauceRule.max_sauces) {
          toast.error(`Massimo ${effectiveSauceRule.max_sauces} salse`)
          return prev
        }
        next.add(sauceId)
      } else {
        next.delete(sauceId)
      }
      return next
    })
  }

  const toggleExtra = (extraName: string, checked: boolean) => {
    setSelectedExtras((prev) => {
      const next = new Set(prev)
      if (checked) next.add(extraName)
      else next.delete(extraName)
      return next
    })
  }

  const toggleRemovedIngredient = (ingredient: string, checked: boolean) => {
    setSelectedRemovedIngredients((prev) => {
      const next = new Set(prev)
      if (checked) next.add(ingredient)
      else next.delete(ingredient)
      return next
    })
  }

  const handleConfirmAddToCart = () => {
    const selectedPieceOption = pieceOptions.find((option) => option.id === selectedPieceOptionId) || null
    if (hasPieceOptions && !selectedPieceOption) {
      toast.error('Scegli una quantità')
      return
    }

    const selectedSauceItems = sauceOptions.filter((item) => selectedSauceIds.has(item.id))
    const selectedExtraItems = saucesOnly ? [] : extraOptions.filter((item) => selectedExtras.has(item.id))
    const extrasList = selectedExtraItems.map((item) => item.name)
    const additionsParts: string[] = []
    if (selectedSauceItems.length > 0) {
      additionsParts.push(`Salse: ${selectedSauceItems.map((item) => item.name).join(', ')}`)
    }
    if (extrasList.length > 0) {
      additionsParts.push(`Extra: ${extrasList.join(', ')}`)
    }
    const additions = additionsParts.join(' | ')
    const removedIngredients = removableIngredientOptions.filter((ingredient) => selectedRemovedIngredients.has(ingredient))
    const saucesUnitPrice =
      effectiveSauceRule.sauce_mode === 'paid_multi'
        ? selectedSauceItems.length * Number(effectiveSauceRule.sauce_price || 0)
        : 0
    const additionsUnitPrice =
      saucesUnitPrice +
      selectedExtraItems.reduce((sum, item) => sum + Number(item.price || 0), 0)
    const additionsIds = [
      ...selectedSauceItems.map((item) => item.id),
      ...selectedExtraItems.map((item) => item.id),
    ]

    const configuredProduct = selectedPieceOption
      ? {
          ...product,
          name: buildProductNameWithPieceOption(product.name, selectedPieceOption),
          price: selectedPieceOption.price,
        }
      : product

    addItem(configuredProduct, {
      pieceOptionId: selectedPieceOption?.id,
      additions,
      additionsUnitPrice,
      additionsIds,
      removedIngredients,
    })
    
    if (onAddToCart) {
      onAddToCart(product, 1)
    }
    
    setSelectedSauceIds(new Set())
    setSelectedExtras(new Set())
    setSelectedRemovedIngredients(new Set())
    setSelectedPieceOptionId('')
    setAdditionsOpen(false)
  }
  const selectedSaucesPrice =
    effectiveSauceRule.sauce_mode === 'paid_multi'
      ? selectedSauceIds.size * Number(effectiveSauceRule.sauce_price || 0)
      : 0
  const selectedExtrasPrice = extraOptions
    .filter((item) => selectedExtras.has(item.id))
    .reduce((sum, item) => sum + Number(item.price || 0), 0)
  const additionsTotalLabel = (selectedSaucesPrice + selectedExtrasPrice).toFixed(2).replace('.', ',')

  const handleDecrementInCart = () => {
    const firstItem = productCartItems[0]
    if (!firstItem) return
    updateQuantity(getCartItemKey(firstItem), firstItem.quantity - 1)
  }
  const hasDetails = Boolean(details?.description || details?.ingredients || details?.allergens)
  const additionsDescription = canRemoveIngredients && removableIngredientOptions.length > 0
    ? saucesOnly
      ? 'Scegli una salsa e gli ingredienti da togliere per personalizzare il prodotto.'
      : 'Scegli una salsa, gli extra e gli ingredienti da togliere per personalizzare il prodotto.'
    : saucesOnly
      ? 'Scegli una salsa per personalizzare il prodotto.'
      : 'Scegli una salsa e gli extra per personalizzare il prodotto.'

  const renderPieceOptionsSection = () => {
    if (!hasPieceOptions) return null

    return (
      <div className="space-y-3">
        <p className="text-lg font-semibold">Scegli quantita</p>
        <div className="flex flex-wrap gap-3">
          {pieceOptions.map((option) => {
            const selected = selectedPieceOptionId === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedPieceOptionId(option.id)}
                className={`flex min-w-[88px] flex-col items-center gap-2 rounded-2xl border px-3 py-3 transition-colors ${
                  selected ? 'border-primary bg-primary/10' : 'border-border bg-background'
                }`}
                aria-pressed={selected}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg font-bold ${
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                }`}>
                  {option.pieces}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">pezzi</span>
                <span className="text-sm font-semibold">{option.price.toFixed(2)}€</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderIngredientRemovalsSection = () => {
    if (!canRemoveIngredients) return null

    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Togli ingredienti</p>
          <p className="text-xs text-muted-foreground">
            Deseleziona gli ingredienti già presenti nel prodotto.
          </p>
        </div>
        {removableIngredientOptions.length > 0 ? (
          <div className="grid gap-2">
            {removableIngredientOptions.map((ingredient) => {
              const checked = selectedRemovedIngredients.has(ingredient)
              return (
                <label key={ingredient} className="flex items-center gap-2 rounded-md border p-2.5 text">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggleRemovedIngredient(ingredient, Boolean(value))}
                  />
                  <span>{ingredient}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Nessun ingrediente configurato per questo prodotto.
          </p>
        )}
      </div>
    )
  }

  const ensureDetails = async () => {
    if (details || detailsLoading) return
    setDetailsLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('description, ingredients, allergens')
        .eq('id', product.id)
        .single()
      if (!error) {
        setDetails({
          description: data?.description ?? null,
          ingredients: data?.ingredients ?? null,
          allergens: data?.allergens ?? null,
        })
      } else {
        setDetails({ description: null, ingredients: null, allergens: null })
      }
    } catch {
      setDetails({ description: null, ingredients: null, allergens: null })
    } finally {
      setDetailsLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <div className="relative aspect-[16/10] sm:aspect-[4/3] bg-white">
        {product.image_url ? (
          imageFit === 'contain' ? (
            <div className="absolute inset-3 sm:inset-4">
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
          ) : (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            Nessuna immagine
          </div>
        )}
        {!product.available && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Badge variant="destructive" className="text-sm">Non disponibile</Badge>
          </div>
        )}
        {inCartQuantity > 0 && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-primary text-primary-foreground shadow-md">
              {inCartQuantity} nel carrello
            </Badge>
          </div>
        )}
        {product.label && (
          <div className="absolute top-2 left-2">
            <Badge 
              className={product.label === 'sconto' 
                ? 'bg-red-500 text-white shadow-md' 
                : 'bg-green-500 text-white shadow-md'
              }
            >
              {product.label === 'sconto' ? '🏷️ Sconto' : '✨ Novità'}
            </Badge>
          </div>
        )}
      </div>
      
      <CardHeader className="flex-grow space-y-1.5 p-3 sm:space-y-2 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <CardTitle className="min-w-0 line-clamp-2 break-words text-[20px] leading-tight text-pretty sm:text-xl">
              {product.name}
            </CardTitle>
            <Drawer
              open={detailsOpen}
              onOpenChange={(open) => {
                setDetailsOpen(open)
                if (open) void ensureDetails()
              }}
            >
              <DrawerTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 -mt-1">
                  <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="sr-only">Informazioni prodotto</span>
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[80vh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-6 sm:px-6">
                <DrawerHeader>
                  <DrawerTitle>{product.name}</DrawerTitle>
                  <DrawerDescription className="text-pretty">
                    {detailsLoading ? 'Caricamento dettagli...' : details?.description}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="space-y-4">
                  {detailsLoading && (
                    <p className="text-sm text-muted-foreground">Recupero informazioni...</p>
                  )}
                  {!detailsLoading && !hasDetails && (
                    <p className="text-sm text-muted-foreground">Nessun dettaglio disponibile.</p>
                  )}
                  {details?.ingredients && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Ingredienti:</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {details.ingredients}
                      </p>
                    </div>
                  )}
                  {details?.allergens && (
                    <div className='text-center'>
                      <h4 className="font-semibold mb-2 text-sm">Allergeni:</h4>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {details.allergens.split(',').map((allergen, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {allergen.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {product.available && !hasPieceOptions && (
            <div className="flex items-center border rounded-md bg-background shrink-0" role="group" aria-label="Selettore quantità">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={handleDecrementInCart}
                disabled={inCartQuantity <= 0}
                aria-label="Diminuisci quantità"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="w-8 sm:w-10 text-center font-medium text-xs sm:text-sm" aria-live="polite" aria-atomic="true">
                {inCartQuantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={handleOpenAdditions}
                aria-label={`Aggiungi ${product.name}`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          {product.available && hasPieceOptions && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              onClick={handleOpenAdditions}
              aria-label={`Scegli porzione per ${product.name}`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {details?.description && (
          <CardDescription className="line-clamp-2 text-[13px] leading-snug sm:text-sm sm:leading-relaxed">
            {details.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardFooter className="flex items-center justify-between gap-3 p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl sm:text-2xl font-bold text-primary leading-none">
            {product.price.toFixed(2)}€
          </span>
        </div>

        {product.available && (
          <Button 
            onClick={handleOpenAdditions} 
            className="h-9 sm:h-10 px-6 sm:px-7 min-w-[130px] sm:min-w-[150px] text-sm whitespace-nowrap justify-center" 
            size="default"
            aria-label={`Aggiungi ${product.name} al carrello`}
          >
            Aggiungi
          </Button>
        )}
      </CardFooter>

      {isMobile ? (
        <Drawer open={additionsOpen} onOpenChange={setAdditionsOpen}>
            <DrawerContent className="w-full max-h-[85vh] rounded-t-2xl p-0 overflow-hidden flex flex-col">
              <DrawerHeader className="px-6 pt-6 pb-3">
              <DrawerTitle>Personalizza {product.name}</DrawerTitle>
              <DrawerDescription>{additionsDescription}</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-4">
                {renderPieceOptionsSection()}
                {renderIngredientRemovalsSection()}

                <div className="space-y-2">
                  <p className="sticky top-0 z-10 bg-background/95 py-1 text-lg font-semibold backdrop-blur">
                    Salse
                    {effectiveSauceRule.sauce_mode === 'paid_multi' && ` (${selectedSauceIds.size}/${effectiveSauceRule.max_sauces})`}
                    {effectiveSauceRule.sauce_mode === 'free_single' && ' (max 1 gratuita)'}
                  </p>
                  {effectiveSauceRule.sauce_mode === 'none' ? (
                    <p className="text-xs text-muted-foreground">Salse non disponibili per questa categoria.</p>
                  ) : (
                    <div className="grid gap-2">
                      {saucesLoading && (
                        <p className="text-xs text-muted-foreground">Caricamento salse...</p>
                      )}
                      {!saucesLoading &&
                        sauceOptions.map((sauce) => {
                          const checked = selectedSauceIds.has(sauce.id)
                          const disableByLimit =
                            effectiveSauceRule.sauce_mode === 'paid_multi' &&
                            !checked &&
                            selectedSauceIds.size >= effectiveSauceRule.max_sauces
                          return (
                            <label key={sauce.id} className="flex items-center justify-between rounded-md border p-2.5 text">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
                                  disabled={disableByLimit}
                                  onCheckedChange={(value) => toggleSauce(sauce.id, Boolean(value))}
                                />
                                <span>{sauce.name}</span>
                              </div>
                              {effectiveSauceRule.sauce_mode === 'paid_multi' && (
                                <span className="font-medium">
                                  +{Number(effectiveSauceRule.sauce_price).toFixed(2).replace('.', ',')}€
                                </span>
                              )}
                            </label>
                          )
                        })}
                      {!saucesLoading && sauceOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessuna salsa disponibile.</p>
                      )}
                    </div>
                  )}
                </div>

                {!saucesOnly && (
                  <div className="space-y-2">
                    <p className="sticky top-0 z-10 bg-background/95 py-1 text-lg font-semibold backdrop-blur">Extra</p>
                    <div className="grid gap-2">
                      {extraOptions.map((extra) => {
                        const checked = selectedExtras.has(extra.id)
                        return (
                          <label key={extra.id} className="flex items-center justify-between rounded-md border p-2.5 text">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleExtra(extra.id, Boolean(value))}
                              />
                              <span>{extra.name}</span>
                            </div>
                            <span className="font-medium">+{Number(extra.price || 0).toFixed(2).replace('.', ',')}€</span>
                          </label>
                        )
                      })}
                      {!saucesLoading && extraOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessun extra disponibile.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t bg-background/95 backdrop-blur px-6 py-3 space-y-3 pb-8">
              <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                Totale aggiunte: +{additionsTotalLabel}€
              </div>
              <div className="flex gap-2 ">
                <Button variant="outline" className="flex-1" onClick={() => setAdditionsOpen(false)}>
                  Annulla
                </Button>
                <Button className="flex-1" onClick={handleConfirmAddToCart}>
                  Aggiungi al carrello
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={additionsOpen} onOpenChange={setAdditionsOpen}>
          <DialogContent className="flex h-[85vh] max-h-[85vh] max-w-xl flex-col overflow-hidden p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-3 text-left">
            <DialogTitle>Personalizza {product.name}</DialogTitle>
            <DialogDescription>{additionsDescription}</DialogDescription>
          </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-4">
                {renderPieceOptionsSection()}
                {renderIngredientRemovalsSection()}

                <div className="space-y-2">
                  <p className="text-lg font-semibold">
                    Salse
                    {effectiveSauceRule.sauce_mode === 'paid_multi' && ` (${selectedSauceIds.size}/${effectiveSauceRule.max_sauces})`}
                    {effectiveSauceRule.sauce_mode === 'free_single' && ' (max 1 gratuita)'}
                  </p>
                  {effectiveSauceRule.sauce_mode === 'none' ? (
                    <p className="text-xs text-muted-foreground">Salse non disponibili per questa categoria.</p>
                  ) : (
                    <div className="grid gap-2">
                      {saucesLoading && (
                        <p className="text-xs text-muted-foreground">Caricamento salse...</p>
                      )}
                      {!saucesLoading &&
                        sauceOptions.map((sauce) => {
                          const checked = selectedSauceIds.has(sauce.id)
                          const disableByLimit =
                            effectiveSauceRule.sauce_mode === 'paid_multi' &&
                            !checked &&
                            selectedSauceIds.size >= effectiveSauceRule.max_sauces
                          return (
                            <label key={sauce.id} className="flex items-center justify-between rounded-md border p-2.5 text">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
                                  disabled={disableByLimit}
                                  onCheckedChange={(value) => toggleSauce(sauce.id, Boolean(value))}
                                />
                                <span>{sauce.name}</span>
                              </div>
                              {effectiveSauceRule.sauce_mode === 'paid_multi' && (
                                <span className="font-medium">
                                  +{Number(effectiveSauceRule.sauce_price).toFixed(2).replace('.', ',')}€
                                </span>
                              )}
                            </label>
                          )
                        })}
                      {!saucesLoading && sauceOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessuna salsa disponibile.</p>
                      )}
                    </div>
                  )}
                </div>

                {!saucesOnly && (
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">Extra</p>
                    <div className="grid gap-2">
                      {extraOptions.map((extra) => {
                        const checked = selectedExtras.has(extra.id)
                        return (
                          <label key={extra.id} className="flex items-center justify-between rounded-md border p-2.5 text">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleExtra(extra.id, Boolean(value))}
                              />
                              <span>{extra.name}</span>
                            </div>
                            <span className="font-medium">+{Number(extra.price || 0).toFixed(2).replace('.', ',')}€</span>
                          </label>
                        )
                      })}
                      {!saucesLoading && extraOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessun extra disponibile.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 shrink-0 border-t bg-background px-6 py-3 space-y-3">
              <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                Totale aggiunte: +{additionsTotalLabel}€
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAdditionsOpen(false)}>
                  Annulla
                </Button>
                <Button className="flex-1" onClick={handleConfirmAddToCart}>
                  Aggiungi al carrello
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
