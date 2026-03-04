'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
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

  const isHomePage = pathname === '/'

  if (totalItems === 0 || !isHomePage) {
    return null
  }

  const goToCart = () => {
    router.push('/cart')
  }

  const handleCartClick = async () => {
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
      <Button
        size="lg"
        className="fixed inset-x-0 bottom-0 z-50 h-[calc(4rem+env(safe-area-inset-bottom))] w-full justify-between overflow-visible rounded-none border-t border-black/10 px-5 pb-[env(safe-area-inset-bottom)] pt-0 text-black shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_-10px_34px_rgba(0,0,0,0.16)] disabled:opacity-100"
        style={{ backgroundColor: '#FCC103' }}
        onClick={handleCartClick}
        disabled={upsellLoading}
        aria-label={`Carrello (${totalItems} articoli)`}
      >
        <span className="inline-flex items-center">
          Vai al carrello
        </span>
        <span className="relative mr-2 inline-flex h-full items-center pl-14">
          <Image
            src="/Bag.svg"
            alt=""
            width={34}
            height={34}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-32 w-32 -translate-y-14"
          />
          <Badge className="h-6 min-w-6 -translate-x-4 -translate-y-10 rounded-full bg-red-500 px-2 text-xs font-bold text-white">
            {totalItems}
          </Badge>
        </span>
        <span className="sr-only">Carrello ({totalItems} articoli)</span>
      </Button>

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
