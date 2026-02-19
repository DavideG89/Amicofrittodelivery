'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Info, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/lib/cart-context'

export function Header() {
  const { totalItems } = useCart()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-3 sm:px-4">
        <Button variant="ghost" size="icon" asChild className="md:invisible h-10 w-10">
          <Link href="/info">
            <Info className="h-5 w-5" />
            <span className="sr-only">Informazioni</span>
          </Link>
        </Button>

        <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <Image 
            src="/logo.png" 
            alt="Amico Fritto" 
            width={150} 
            height={50}
            style={{ height: 'auto', width: 'auto', maxHeight: '48px' }}
            priority
          />
        </Link>
        
        <nav className="flex items-center gap-1 sm:gap-2 mr-2 sm:mr-4">
          <Button variant="ghost" size="icon" asChild className="hidden md:flex h-10 w-10">
            <Link href="/info">
              <Info className="h-5 w-5" />
              <span className="sr-only">Informazioni</span>
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild className="h-10 w-10">
            <Link href="/utente" aria-label="Utente">
              <User className="h-5 w-5" />
              <span className="sr-only">Utente</span>
            </Link>
          </Button>
          
          <Button variant="ghost" size="icon" className="relative hidden md:flex" asChild>
            <Link href="/cart">
              <ShoppingCart className="h-5 w-5" />
              {totalItems > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {totalItems}
                </Badge>
              )}
              <span className="sr-only">Carrello ({totalItems})</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
