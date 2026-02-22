'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, Minus, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useCart } from '@/lib/cart-context'
import { Product } from '@/lib/supabase'

type ProductCardProps = {
  product: Product
  onAddToCart?: (product: Product, quantity: number) => void
  imageFit?: 'cover' | 'contain'
}

export function ProductCard({ product, onAddToCart, imageFit = 'cover' }: ProductCardProps) {
  const { addItem, items } = useCart()
  const [quantity, setQuantity] = useState(1)
  
  const cartItem = items.find(item => item.product.id === product.id)
  const inCartQuantity = cartItem?.quantity || 0

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addItem(product)
    }
    
    // Trigger upsell callback if provided
    if (onAddToCart) {
      onAddToCart(product, quantity)
    }
    
    setQuantity(1)
  }

  const handleIncrement = () => setQuantity(prev => prev + 1)
  const handleDecrement = () => setQuantity(prev => Math.max(1, prev - 1))

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
          {(product.ingredients || product.allergens) && (
            <Dialog>
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
                    {product.description}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {product.ingredients && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Ingredienti:</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {product.ingredients}
                      </p>
                    </div>
                  )}
                  {product.allergens && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Allergeni:</h4>
                      <div className="flex flex-wrap gap-2">
                        {product.allergens.split(',').map((allergen, i) => (
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
          )}
        </div>
        {product.description && (
          <CardDescription className="line-clamp-2 text-sm leading-relaxed">
            {product.description}
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
                onClick={handleDecrement}
                disabled={quantity <= 1}
                aria-label="Diminuisci quantità"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="w-10 text-center font-medium text-sm" aria-live="polite" aria-atomic="true">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleIncrement}
                aria-label="Aumenta quantità"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            
            <Button 
              onClick={handleAddToCart} 
              className="flex-1 sm:flex-none" 
              size="default"
              aria-label={`Aggiungi ${quantity} ${product.name} al carrello`}
            >
              Aggiungi
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
