'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Plus } from 'lucide-react'
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
import { Product } from '@/lib/supabase'
import { useCart } from '@/lib/cart-context'

type UpsellDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerProduct: Product | null
  suggestedProducts: Product[]
}

export function UpsellDialog({
  open,
  onOpenChange,
  triggerProduct,
  suggestedProducts
}: UpsellDialogProps) {
  const { addItem } = useCart()
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
        addItem(product)
      }
    })
    onOpenChange(false)
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  if (!triggerProduct) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl max-h-[85vh]"
        aria-describedby="upsell-description"
      >
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl">
            Perfetto! Aggiungi qualcos'altro?
          </DialogTitle>
          <DialogDescription id="upsell-description">
            Hai aggiunto <strong>{triggerProduct.name}</strong> al carrello. 
            Completa il tuo ordine con questi prodotti:
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3 mt-4 px-1 pb-1 overflow-visible">
            {suggestedProducts.map((product) => {
              const isSelected = selectedProducts.has(product.id)
              
              return (
                <button
                  key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`
                    relative flex flex-col rounded-lg border-2 transition-all
                    ${isSelected 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                    }
                    focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                  `}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Rimuovi' : 'Aggiungi'} ${product.name} al carrello`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-primary text-primary-foreground">
                        Selezionato
                      </Badge>
                    </div>
                  )}

                  <div className="relative aspect-[4/3] sm:aspect-video bg-muted rounded-t-md overflow-hidden">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        Nessuna immagine
                      </div>
                    )}
                  </div>

                  <div className="p-2 sm:p-3 text-left">
                    <h3 className="font-semibold text-xs sm:text-base mb-1">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 mb-2">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-base sm:text-lg font-bold text-primary">
                        {product.price.toFixed(2)}€
                      </span>
                      <Plus 
                        className={`h-4 w-4 sm:h-5 sm:w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>

        <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
          >
            No, grazie
          </Button>
          <Button
            onClick={handleAddSelected}
            disabled={selectedProducts.size === 0}
            className="flex-1"
          >
            Aggiungi {selectedProducts.size > 0 && `(${selectedProducts.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
