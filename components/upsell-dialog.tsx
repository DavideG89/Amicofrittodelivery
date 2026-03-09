'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Plus, Check } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIsMobile } from '@/components/ui/use-mobile'
import { cn } from '@/lib/utils'
import { Product } from '@/lib/supabase'
import { useCart } from '@/lib/cart-context'

type UpsellDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerProduct?: Product | null
  suggestedProducts: Product[]
  mode?: 'after_add' | 'before_checkout' | 'before_cart'
  onSkip?: () => void
  onAddSelectedComplete?: () => void
}

export function UpsellDialog({
  open,
  onOpenChange,
  triggerProduct,
  suggestedProducts,
  mode = 'after_add',
  onSkip,
  onAddSelectedComplete,
}: UpsellDialogProps) {
  const { addItem } = useCart()
  const isMobile = useIsMobile()
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) {
      setSelectedProducts(new Set())
    }
  }, [open])

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
    })
  }

  const handleAddSelected = () => {
    selectedProducts.forEach(productId => {
      const product = suggestedProducts.find(p => p.id === productId)
      if (product) {
        addItem(product, { source: 'upsell' })
      }
    })
    onAddSelectedComplete?.()
    onOpenChange(false)
  }

  const handleSkip = () => {
    onSkip?.()
    onOpenChange(false)
  }

  const titleText =
    mode === 'before_checkout'
      ? 'Prima di pagare, vuoi aggiungere qualcosa?'
      : mode === 'before_cart'
        ? 'Vuoi qualcosa in più per godertelo al massimo? 😉'
        : 'Perfetto! Aggiungi qualcos\'altro?'

  const descriptionText =
    mode === 'before_checkout' || mode === 'before_cart'
      ? 'Completa il tuo ordine con questi prodotti consigliati:'
      : `Hai aggiunto ${triggerProduct?.name ?? 'un prodotto'} al carrello. Completa il tuo ordine con questi prodotti:`

  const confirmLabel =
    mode === 'before_checkout'
      ? 'Aggiungi e vai al checkout'
      : mode === 'before_cart'
        ? 'Aggiungi e vai al carrello'
        : 'Aggiungi'

  const renderProductCard = (product: Product, mobileLayout: boolean) => {
    const isSelected = selectedProducts.has(product.id)

    return (
      <button
        key={product.id}
        onClick={() => toggleProduct(product.id)}
        className={cn(
          'relative flex flex-col border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          mobileLayout
            ? 'w-[66vw] max-w-[270px] shrink-0 snap-start rounded-xl'
            : 'rounded-lg',
          isSelected ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/50',
        )}
        aria-pressed={isSelected}
        aria-label={`${isSelected ? 'Rimuovi' : 'Aggiungi'} ${product.name} al carrello`}
      >
        {isSelected && (
          <div className="absolute right-2 top-2 z-10">
            <Badge className="bg-primary text-primary-foreground">Selezionato</Badge>
          </div>
        )}

        <div className={cn('relative bg-muted overflow-hidden', mobileLayout ? 'aspect-[16/10] rounded-t-xl' : 'aspect-[4/3] rounded-t-md sm:aspect-video')}>
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes={mobileLayout ? '66vw' : '(max-width: 640px) 50vw, 33vw'}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Nessuna immagine
            </div>
          )}
        </div>

        <div className={cn('text-left', mobileLayout ? 'p-3' : 'p-2 sm:p-3')}>
          <h3 className={cn('font-semibold mb-1', mobileLayout ? 'text-sm' : 'text-xs sm:text-base')}>
            {product.name}
          </h3>
          {product.description && (
            <p className={cn('text-muted-foreground line-clamp-2 mb-2', mobileLayout ? 'text-xs' : 'text-[11px] sm:text-xs')}>
              {product.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className={cn('font-bold text-primary', mobileLayout ? 'text-lg' : 'text-base sm:text-lg')}>
              {product.price.toFixed(2)}€
            </span>
            {isSelected ? (
              <Check className={cn('text-green-600', mobileLayout ? 'h-5 w-5' : 'h-4 w-4 sm:h-5 sm:w-5')} aria-hidden="true" />
            ) : (
              <Plus className={cn('text-muted-foreground', mobileLayout ? 'h-5 w-5' : 'h-4 w-4 sm:h-5 sm:w-5')} aria-hidden="true" />
            )}
          </div>
        </div>
      </button>
    )
  }

  const renderActions = (mobileLayout: boolean) => (
    <div
      className={cn(
        'border-t',
        mobileLayout
          ? 'mt-auto bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3'
          : 'mt-4 pt-4',
      )}
    >
      <div className={cn('gap-3', mobileLayout ? 'grid grid-cols-2 pb-8' : 'flex flex-col sm:flex-row')}>
      <Button onClick={handleAddSelected} disabled={selectedProducts.size === 0} className="flex-1">
          {confirmLabel}
          {selectedProducts.size > 0 && ` (${selectedProducts.size})`}
        </Button>
        <Button variant="outline" onClick={handleSkip} className="flex-1">
          No, grazie
        </Button>
     
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] rounded-t-2xl p-0">
          <DrawerHeader className="px-4 pb-2 pt-5 text-left">
            <DrawerTitle className="text-pretty text-lg leading-tight">{titleText}</DrawerTitle>
            <DrawerDescription id="upsell-description-mobile" className="text-sm">
              {descriptionText}
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-hidden px-4 pb-2">
            <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 pt-1">
              {suggestedProducts.map((product) => renderProductCard(product, true))}
            </div>
          </div>

          {renderActions(true)}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl" aria-describedby="upsell-description-desktop">
        <DialogHeader className="w-full">
          <DialogTitle className="mx-auto text-balance text-xl leading-tight sm:text-2xl">
            {titleText}
          </DialogTitle>
          <DialogDescription id="upsell-description-desktop" className="text-center text-sm sm:text-base">
            {descriptionText}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="mt-4 grid grid-cols-2 gap-2 overflow-visible px-1 pb-1 sm:gap-3">
            {suggestedProducts.map((product) => renderProductCard(product, false))}
          </div>
        </ScrollArea>

        {renderActions(false)}
      </DialogContent>
    </Dialog>
  )
}
