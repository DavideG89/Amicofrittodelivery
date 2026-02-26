'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UpsellDialog } from '@/components/upsell-dialog'
import { useCart } from '@/lib/cart-context'
import { fetchUpsellSuggestions } from '@/lib/upsell'
import { Product } from '@/lib/supabase'

export function FloatingCartButton() {
  const { totalItems, items } = useCart()
  const router = useRouter()
  const pathname = usePathname()
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [upsellLoading, setUpsellLoading] = useState(false)
  const [upsellSuggestions, setUpsellSuggestions] = useState<Product[]>([])

  if (totalItems === 0) {
    return null
  }

  const goToCart = () => {
    router.push('/cart')
  }

  const handleCartClick = async () => {
    if (pathname === '/cart') return
    setUpsellLoading(true)
    try {
      const suggestions = await fetchUpsellSuggestions(items.map((item) => item.product.id))
      if (suggestions.length > 0) {
        setUpsellSuggestions(suggestions)
        setUpsellOpen(true)
        return
      }
      goToCart()
    } finally {
      setUpsellLoading(false)
    }
  }

  return (
    <>
      <div className="md:hidden fixed bottom-24 left-6 right-auto z-50">
        <Button 
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
          style={{ backgroundColor: '#FCC103' }}
          onClick={handleCartClick}
          disabled={upsellLoading}
          aria-label={`Carrello (${totalItems} articoli)`}
        >
          <ShoppingCart className="h-6 w-6 text-black" />
          <Badge 
            className="absolute -right-1 -top-1 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-bold bg-red-500 text-white border-2 border-white"
          >
            {totalItems}
          </Badge>
          <span className="sr-only">Carrello ({totalItems} articoli)</span>
        </Button>
      </div>

      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        suggestedProducts={upsellSuggestions}
        mode="before_cart"
        onSkip={goToCart}
        onAddSelectedComplete={goToCart}
      />
    </>
  )
}
