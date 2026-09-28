'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Product } from '@/lib/supabase'

type OfferProductCardProps = {
  product: Product
  onAdd: () => void
  onDetails: () => void
}

// La presentazione condivide azioni, dettagli e carrello con ProductCard.
export function OfferProductCard({ product, onAdd, onDetails }: OfferProductCardProps) {
  return (
    <article className="relative w-full h-64 overflow-hidden rounded-lg bg-offer-section">
      <Image
        src="/offers/card-background.svg"
        alt=""
        width={400}
        height={300}
        className="pointer-events-none absolute -left-16 -top-1 max-w-none"
        aria-hidden="true"
      />
      <div className="absolute right-3 top-8 h-[180px] w-[280px]">
        {product.image_url ? (
          <Image src={product.image_url} alt="" fill sizes="(max-width: 600px) 75vw, 288px" className="object-contain" />
        ) : (
          <span className="flex h-full items-center justify-center text-label">Nessuna immagine</span>
        )}
      </div>
      <div className="absolute inset-x-4 bottom-6 z-10 flex flex-col items-start">
        <Button
          type="button"
          variant="link"
          size="icon"
          onClick={onDetails}
          aria-label={`Informazioni su ${product.name}`}
          className="-ml-1 h-6 w-10 rounded-full hover:bg-offer-button"
        >
          <Image src="/offers/info.svg" alt="" aria-hidden="true" width={12} height={12} />
        </Button>
        <p className="offer-card-text-outline max-w-full font-heading text-title font-bold leading-none text-offer-white sm:text-display">
          <span className="sr-only">Prezzo: </span>{product.price.toFixed(2)}€
        </p>
        <h3
          className={cn(
            'offer-card-text-outline -mx-1 mb-2 mt-2 max-w-full px-1 font-bold uppercase leading-snug',
            product.name.length > 18 ? 'line-clamp-2 text-xl' : 'truncate text-body-lg',
          )}
          title={product.name}
        >
          {product.name}
        </h3>
        <Button
          type="button"
          variant="secondary"
          onClick={onAdd}
          disabled={!product.available}
          aria-label={product.available ? `Aggiungi ${product.name} al carrello` : `${product.name} non disponibile`}
          className="min-w-36"
        >
          {product.available ? 'Aggiungi' : 'Non disponibile'}
        </Button>
      </div>
    </article>
  )
}
