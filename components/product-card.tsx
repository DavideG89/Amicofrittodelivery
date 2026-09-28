'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Info } from 'lucide-react'
import { OfferProductCard } from '@/components/offer-product-card'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { useIsMobile } from '@/components/ui/use-mobile'
import { useCart } from '@/lib/cart-context'
import { buildProductNameWithPieceOption, normalizeProductPieceOptions } from '@/lib/product-piece-options'
import { Product, supabase, OrderAddition, ProductIngredient } from '@/lib/supabase'
import { DEFAULT_SAUCE_RULE, getFallbackSauceRuleByCategorySlug, normalizeSauceRule, SauceRule } from '@/lib/sauce-rules'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ProductCardProps = {
  product: Product
  variant?: 'default' | 'offer'
  onAddToCart?: (product: Product, quantity: number) => void
  imageFit?: 'cover' | 'contain'
  skipAdditions?: boolean
  categorySlug?: string | null
  saucesOnly?: boolean
  forceFreeSingleSauce?: boolean
  ingredientCustomizationEnabled?: boolean
}

export function ProductCard({
  product,
  variant = 'default',
  onAddToCart,
  imageFit = 'cover',
  skipAdditions = false,
  categorySlug,
  saucesOnly = false,
  forceFreeSingleSauce = false,
  ingredientCustomizationEnabled = false,
}: ProductCardProps) {
  const { addItem, items } = useCart()
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
  const [selectedPieceOptionId, setSelectedPieceOptionId] = useState('')
  const [removableIngredients, setRemovableIngredients] = useState<ProductIngredient[]>([])
  const [selectedRemovedIngredientIds, setSelectedRemovedIngredientIds] = useState<Set<string>>(new Set())
  const [ingredientsLoading, setIngredientsLoading] = useState(false)
  
  const pieceOptions = normalizeProductPieceOptions(product.piece_options)
  const hasPieceOptions = pieceOptions.length > 0
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

  const loadRemovableIngredients = async () => {
    if (!ingredientCustomizationEnabled || removableIngredients.length > 0 || ingredientsLoading) return
    setIngredientsLoading(true)
    try {
      const { data, error } = await supabase
        .from('product_ingredients')
        .select('id, product_id, name, removable, active, display_order, created_at, updated_at')
        .eq('product_id', product.id)
        .eq('active', true)
        .eq('removable', true)
        .order('display_order', { ascending: true })
      if (error) throw error
      setRemovableIngredients((data || []) as ProductIngredient[])
    } catch {
      setRemovableIngredients([])
    } finally {
      setIngredientsLoading(false)
    }
  }

  const handleOpenAdditions = async () => {
    if (!product.available) return
    if (skipAdditions && !hasPieceOptions && !ingredientCustomizationEnabled) {
      addItem(product)
      if (onAddToCart) onAddToCart(product, 1)
      return
    }
    setSelectedSauceIds(new Set())
    setSelectedExtras(new Set())
    setSelectedPieceOptionId(pieceOptions.length === 1 ? pieceOptions[0].id : '')
    setSelectedRemovedIngredientIds(new Set())
    setAdditionsOpen(true)
    await Promise.all([loadSauces(), loadSauceRule(), loadRemovableIngredients()])
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
      removedIngredientIds: [...selectedRemovedIngredientIds],
      removedIngredients: removableIngredients
        .filter((ingredient) => selectedRemovedIngredientIds.has(ingredient.id))
        .map(({ id, name }) => ({ id, name })),
      ingredientCustomizationEnabled,
    })
    
    if (onAddToCart) {
      onAddToCart(product, 1)
    }
    
    setSelectedSauceIds(new Set())
    setSelectedExtras(new Set())
    setSelectedPieceOptionId('')
    setSelectedRemovedIngredientIds(new Set())
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

  const hasDetails = Boolean(details?.description || details?.ingredients || details?.allergens)

  const openDetails = () => {
    setDetailsOpen(true)
    void ensureDetails()
  }

  const renderPieceOptionsSection = () => {
    if (!hasPieceOptions) return null

    return (
      <div className="space-y-3">
        <p className="text-body font-semibold">Scegli quantita</p>
        <div className="flex flex-wrap gap-3">
          {pieceOptions.map((option) => {
            const selected = selectedPieceOptionId === option.id
            return (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                onClick={() => setSelectedPieceOptionId(option.id)}
                className={cn('h-auto min-w-24 flex-col rounded-full px-3 py-3 font-normal', selected && 'border-primary bg-primary/10 hover:bg-primary/10')}
                aria-pressed={selected}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full border text-body font-bold ${
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                }`}>
                  {option.pieces}
                </span>
                <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">pezzi</span>
                <span className="text-label font-semibold">{option.price.toFixed(2)}€</span>
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderRemovedIngredientsSection = () => {
    if (!ingredientCustomizationEnabled || (!ingredientsLoading && removableIngredients.length === 0)) return null
    return (
      <>
        <div className="space-y-2">
          <p className="text-body font-semibold">Rimuovi ingredienti</p>
          {ingredientsLoading ? (
            <p className="text-caption text-muted-foreground">Caricamento ingredienti...</p>
          ) : (
            <div className="grid gap-2">
              {removableIngredients.map((ingredient) => {
                const checked = selectedRemovedIngredientIds.has(ingredient.id)
                return (
                  <label key={ingredient.id} className="flex items-center gap-2 rounded-md border p-2.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => setSelectedRemovedIngredientIds((current) => {
                        const next = new Set(current)
                        if (value) next.add(ingredient.id)
                        else next.delete(ingredient.id)
                        return next
                      })}
                    />
                    <span>{ingredient.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <Separator />
      </>
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
    <Card className={variant === 'offer'
      ? 'h-full overflow-hidden rounded-lg border-0 bg-offer-section text-offer-foreground shadow-none'
      : 'flex h-full flex-col overflow-hidden bg-card hover:shadow-lg transition-shadow duration-300'}>
      {variant === 'offer' ? (
        <OfferProductCard
          product={product}
          onAdd={() => void handleOpenAdditions()}
          onDetails={openDetails}
        />
      ) : (
        <>
      <div className="relative mx-6 mt-4 aspect-[16/10] bg-card lg:mx-8 lg:mt-8">
        {product.image_url ? (
          imageFit === 'contain' ? (
            <div className="absolute inset-3 sm:inset-4">
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 100vw, (max-width: 1152px) 50vw, 520px"
              />
            </div>
          ) : (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1152px) 50vw, 520px"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-label">
            Nessuna immagine
          </div>
        )}
        {!product.available && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Badge variant="destructive" className="text-label">Non disponibile</Badge>
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
                ? 'bg-destructive text-destructive-foreground shadow-md'
                : 'bg-green-500 text-white shadow-md'
              }
            >
              {product.label === 'sconto' ? '🏷️ Sconto' : '✨ Novità'}
            </Badge>
          </div>
        )}
      </div>
      
      <CardHeader className="flex-grow px-4 pb-0 pt-0 lg:px-8">
        <div className="flex min-w-0 items-start gap-1.5">
          <CardTitle className="min-w-0 line-clamp-2 break-words text-pretty text-body-xl leading-tight sm:text-body-lg lg:text-section-title">
            {product.name}
          </CardTitle>
          <Button variant="link" size="icon" className="-mr-2 -mt-2 h-11 w-11 shrink-0" onClick={openDetails} aria-label={`Informazioni su ${product.name}`}>
            <Info className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>

      <CardFooter className="flex flex-wrap items-end justify-between gap-2 px-4 pb-4 pt-2 lg:px-8 lg:pb-8 lg:pt-4">
        <span className="font-sans text-title font-extrabold leading-none text-primary sm:text-body-xl lg:text-display lg:font-bold">
          {product.price.toFixed(2)}€
        </span>

        {product.available && (
          <Button
            onClick={handleOpenAdditions} 
            className="min-w-28 sm:min-w-24 lg:min-w-40"
            size="default"
            aria-label={`Aggiungi ${product.name} al carrello`}
          >
            Aggiungi
          </Button>
        )}
      </CardFooter>
        </>
      )}

      <Drawer
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (open) void ensureDetails()
        }}
      >
        <DrawerContent className="max-h-[80vh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-6 sm:px-6">
          <div className="relative mx-auto mb-3 h-44 w-full max-w-sm overflow-hidden rounded-2xl bg-white">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 90vw, 384px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-label text-muted-foreground">
                Nessuna immagine
              </div>
            )}
          </div>
          <DrawerHeader>
            <DrawerTitle>{product.name}</DrawerTitle>
            <DrawerDescription className="text-pretty">
              {detailsLoading ? 'Caricamento dettagli...' : details?.description}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4">
            {detailsLoading && (
              <p className="text-label text-muted-foreground">Recupero informazioni...</p>
            )}
            {!detailsLoading && !hasDetails && (
              <p className="text-label text-muted-foreground">Nessun dettaglio disponibile.</p>
            )}
            {details?.ingredients && (
              <div>
                <h4 className="font-semibold mb-2 text-label">Ingredienti:</h4>
                <p className="text-label text-muted-foreground leading-relaxed">
                  {details.ingredients}
                </p>
              </div>
            )}
            {details?.allergens && (
              <div className='text-center'>
                <h4 className="font-semibold mb-2 text-label">Allergeni:</h4>
                <div className="flex flex-wrap gap-2 justify-center">
                  {details.allergens.split(',').map((allergen, i) => (
                    <Badge key={i} variant="secondary" className="text-caption">
                      {allergen.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {isMobile ? (
        <Drawer open={additionsOpen} onOpenChange={setAdditionsOpen}>
          <DrawerContent className="w-full max-h-[85vh] rounded-t-2xl p-0 overflow-hidden flex flex-col">
            <DrawerHeader className="px-6 pt-6 pb-3">
              <DrawerTitle>Personalizza {product.name}</DrawerTitle>
              <DrawerDescription>
                {saucesOnly
                  ? 'Scegli una salsa per personalizzare il prodotto.'
                  : 'Scegli una salsa e gli extra per personalizzare il prodotto.'}
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-4">
                {renderPieceOptionsSection()}
                {renderRemovedIngredientsSection()}

                <p className="text-body font-semibold">Aggiunte</p>

                <div className="space-y-2">
                  <p className="sticky top-0 z-10 bg-background/95 py-1 text-body font-semibold backdrop-blur">
                    Salse
                    {effectiveSauceRule.sauce_mode === 'paid_multi' && ` (${selectedSauceIds.size}/${effectiveSauceRule.max_sauces})`}
                    {effectiveSauceRule.sauce_mode === 'free_single' && ' (max 1 gratuita)'}
                  </p>
                  {effectiveSauceRule.sauce_mode === 'none' ? (
                    <p className="text-caption text-muted-foreground">Salse non disponibili per questa categoria.</p>
                  ) : (
                    <div className="grid gap-2">
                      {saucesLoading && (
                        <p className="text-caption text-muted-foreground">Caricamento salse...</p>
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
                        <p className="text-caption text-muted-foreground">Nessuna salsa disponibile.</p>
                      )}
                    </div>
                  )}
                </div>

                {!saucesOnly && (
                  <div className="space-y-2">
                    <p className="sticky top-0 z-10 bg-background/95 py-1 text-body font-semibold backdrop-blur">Extra</p>
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
                        <p className="text-caption text-muted-foreground">Nessun extra disponibile.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t bg-background/95 backdrop-blur px-6 py-3 space-y-3 pb-8">
              <div className="rounded-md bg-muted px-3 py-2 text-label font-medium">
                Totale aggiunte: +{additionsTotalLabel}€
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
              <DialogDescription>
                {saucesOnly
                  ? 'Scegli una salsa per personalizzare il prodotto.'
                  : 'Scegli una salsa e gli extra per personalizzare il prodotto.'}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-4">
                {renderPieceOptionsSection()}
                {renderRemovedIngredientsSection()}

                <p className="text-body font-semibold">Aggiunte</p>

                <div className="space-y-2">
                  <p className="text-body font-semibold">
                    Salse
                    {effectiveSauceRule.sauce_mode === 'paid_multi' && ` (${selectedSauceIds.size}/${effectiveSauceRule.max_sauces})`}
                    {effectiveSauceRule.sauce_mode === 'free_single' && ' (max 1 gratuita)'}
                  </p>
                  {effectiveSauceRule.sauce_mode === 'none' ? (
                    <p className="text-caption text-muted-foreground">Salse non disponibili per questa categoria.</p>
                  ) : (
                    <div className="grid gap-2">
                      {saucesLoading && (
                        <p className="text-caption text-muted-foreground">Caricamento salse...</p>
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
                        <p className="text-caption text-muted-foreground">Nessuna salsa disponibile.</p>
                      )}
                    </div>
                  )}
                </div>

                {!saucesOnly && (
                  <div className="space-y-2">
                    <p className="text-body font-semibold">Extra</p>
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
                        <p className="text-caption text-muted-foreground">Nessun extra disponibile.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 shrink-0 border-t bg-background px-6 py-3 space-y-3">
              <div className="rounded-md bg-muted px-3 py-2 text-label font-medium">
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
