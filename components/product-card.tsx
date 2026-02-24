'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, Minus, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { useCart } from '@/lib/cart-context'
import { Product, supabase, OrderAddition } from '@/lib/supabase'

type ProductCardProps = {
  product: Product
  onAddToCart?: (product: Product, quantity: number) => void
  imageFit?: 'cover' | 'contain'
  skipAdditions?: boolean
}

export function ProductCard({ product, onAddToCart, imageFit = 'cover', skipAdditions = false }: ProductCardProps) {
  const { addItem, items, updateQuantity } = useCart()
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
  const [selectedSauce, setSelectedSauce] = useState('none')
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set())
  
  const cartItem = items.find(item => item.product.id === product.id)
  const inCartQuantity = cartItem?.quantity || 0

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
      setExtraOptions(additions.filter((item) => item.type === 'extra'))
    } catch {
      setSauceOptions([])
      setExtraOptions([])
    } finally {
      setSaucesLoading(false)
    }
  }

  const handleOpenAdditions = async () => {
    if (skipAdditions) {
      addItem(product)
      if (onAddToCart) onAddToCart(product, 1)
      return
    }
    setSelectedSauce('none')
    setSelectedExtras(new Set())
    setAdditionsOpen(true)
    await loadSauces()
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
    const selectedSauceItem = sauceOptions.find((item) => item.id === selectedSauce) || null
    const selectedExtraItems = extraOptions.filter((item) => selectedExtras.has(item.id))
    const extrasList = selectedExtraItems.map((item) => item.name)
    const additionsParts: string[] = []
    if (selectedSauceItem) {
      additionsParts.push(`Salsa: ${selectedSauceItem.name}`)
    }
    if (extrasList.length > 0) {
      additionsParts.push(`Extra: ${extrasList.join(', ')}`)
    }
    const additions = additionsParts.join(' | ')
    const additionsUnitPrice =
      (selectedSauceItem?.price || 0) +
      selectedExtraItems.reduce((sum, item) => sum + Number(item.price || 0), 0)
    const additionsIds = [
      ...(selectedSauceItem ? [selectedSauceItem.id] : []),
      ...selectedExtraItems.map((item) => item.id),
    ]

    addItem(product, { additions, additionsUnitPrice, additionsIds })
    
    if (onAddToCart) {
      onAddToCart(product, 1)
    }
    
    setSelectedSauce('none')
    setSelectedExtras(new Set())
    setAdditionsOpen(false)
  }
  const selectedSaucePrice =
    selectedSauce === 'none' ? 0 : Number(sauceOptions.find((item) => item.id === selectedSauce)?.price || 0)
  const selectedExtrasPrice = extraOptions
    .filter((item) => selectedExtras.has(item.id))
    .reduce((sum, item) => sum + Number(item.price || 0), 0)
  const additionsTotalLabel = (selectedSaucePrice + selectedExtrasPrice).toFixed(2).replace('.', ',')

  const handleDecrementInCart = () => {
    if (inCartQuantity <= 0) return
    updateQuantity(product.id, inCartQuantity - 1)
  }
  const hasDetails = Boolean(details?.description || details?.ingredients || details?.allergens)

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
      <div className="relative aspect-[4/3] bg-white">
        {product.image_url ? (
          imageFit === 'contain' ? (
            <div className="absolute inset-4">
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
      
      <CardHeader className="flex-grow space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base sm:text-lg leading-tight text-pretty">
            {product.name}
          </CardTitle>
          <Dialog
            open={detailsOpen}
            onOpenChange={(open) => {
              setDetailsOpen(open)
              if (open) void ensureDetails()
            }}
          >
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1">
                <Info className="h-3.5 w-3.5" />
                <span className="sr-only">Informazioni prodotto</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{product.name}</DialogTitle>
                <DialogDescription className="text-pretty">
                  {detailsLoading ? 'Caricamento dettagli...' : details?.description}
                </DialogDescription>
              </DialogHeader>
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
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Allergeni:</h4>
                    <div className="flex flex-wrap gap-2">
                      {details.allergens.split(',').map((allergen, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {allergen.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {details?.description && (
          <CardDescription className="line-clamp-2 text-sm leading-relaxed">
            {details.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 pt-0">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-primary">{product.price.toFixed(2)}€</span>
        </div>

        {product.available && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center border rounded-md bg-background" role="group" aria-label="Selettore quantità">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleDecrementInCart}
                disabled={inCartQuantity <= 0}
                aria-label="Diminuisci quantità"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="w-10 text-center font-medium text-sm" aria-live="polite" aria-atomic="true">
                {inCartQuantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleOpenAdditions}
                aria-label={`Aggiungi ${product.name}`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            
            <Button 
              onClick={handleOpenAdditions} 
              className="flex-1 sm:flex-none" 
              size="default"
              aria-label={`Aggiungi ${product.name} al carrello`}
            >
              Aggiungi
            </Button>
          </div>
        )}
      </CardFooter>

      <Dialog open={additionsOpen} onOpenChange={setAdditionsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aggiunte per {product.name}</DialogTitle>
            <DialogDescription>
              Scegli una salsa e gli extra per personalizzare il prodotto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Scegli una salsa</p>
              <RadioGroup value={selectedSauce} onValueChange={setSelectedSauce} className="space-y-2">
                <label className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id={`sauce-none-${product.id}`} value="none" />
                    <span>Nessuna salsa</span>
                  </div>
                </label>
                {saucesLoading && (
                  <p className="text-xs text-muted-foreground">Caricamento salse...</p>
                )}
                {!saucesLoading &&
                  sauceOptions.map((sauce) => (
                    <label key={sauce.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          id={`sauce-${product.id}-${sauce.id}`}
                          value={sauce.id}
                        />
                        <span>{sauce.name}</span>
                      </div>
                      {Number(sauce.price || 0) > 0 && (
                        <span className="font-medium">+{Number(sauce.price).toFixed(2).replace('.', ',')}€</span>
                      )}
                    </label>
                  ))}
                {!saucesLoading && sauceOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nessuna salsa disponibile.</p>
                )}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Extra</p>
              <div className="grid gap-2">
                {extraOptions.map((extra) => {
                  const checked = selectedExtras.has(extra.id)
                  return (
                    <label key={extra.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
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
    </Card>
  )
}
