'use client'

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/lib/cart-context'

export function FloatingCartButton() {
  const { totalItems } = useCart()

  if (totalItems === 0) {
    return null
  }

  return (
    <Link 
      href="/cart"
      className="md:hidden fixed bottom-6 left-6 right-auto z-50"
    >
      <Button 
        size="lg"
        className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        style={{ backgroundColor: '#FCC103' }}
      >
        <ShoppingCart className="h-6 w-6 text-black" />
        <Badge 
          className="absolute -right-1 -top-1 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-bold bg-red-500 text-white border-2 border-white"
        >
          {totalItems}
        </Badge>
        <span className="sr-only">Carrello ({totalItems} articoli)</span>
      </Button>
    </Link>
  )
}
