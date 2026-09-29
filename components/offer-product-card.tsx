'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/supabase'

type OfferProductCardProps = {
  product: Product
  onAdd: () => void
  onDetails: () => void
}

// Le azioni e i dettagli restano gestiti da ProductCard.
export function OfferProductCard({ product, onAdd, onDetails }: OfferProductCardProps) {
  const [mainName, ...bundleParts] = product.name.split(',')
  const subtitle = bundleParts.join(',').trim() || product.description?.trim()

  return (
    <article className="relative h-[200px] w-full overflow-hidden bg-offer-section text-offer-foreground sm:h-64">
      <Image
        src="/offers/card-shape.svg"
        alt=""
        width={303}
        height={236}
        className="pointer-events-none absolute -right-6 -top-5 h-44 w-48 max-w-none rotate-[172deg] scale-y-[-1] sm:-right-8 sm:-top-6 sm:h-auto sm:w-auto"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute right-3 top-5 h-32 w-48 sm:right-0 sm:top-7 sm:h-48 sm:w-[80%]">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 200px, 300px"
            className="object-contain"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-label">Nessuna immagine</span>
        )}
      </div>

      <Badge variant="combo" className="absolute left-2 top-4 -rotate-[7deg] px-2.5 py-0.5 text-caption font-bold uppercase leading-tight shadow-sm sm:left-3 sm:px-3 sm:text-body">
        Combo
      </Badge>

      <Button
        type="button"
        variant="link"
        size="icon"
        onClick={onDetails}
        aria-label={`Informazioni su ${product.name}`}
        className="absolute -left-1 top-7 z-20 h-11 w-11 rounded-full p-0 hover:bg-transparent  sm:left-1 sm:top-14"
      >
        <span className="flex h-3 w-3 items-center justify-center rounded-full bg-primary sm:h-4 sm:w-4">
          <Image src="/offers/info.svg" alt="" width={12} height={12} aria-hidden="true" className="h-2 w-2 sm:h-3 sm:w-3" />
        </span>
      </Button>

      <h3
        className="offer-card-text-outline absolute left-3 top-14 lg:top-24 z-10 flex h-16 w-24 items-center font-heading text-body-lg font-bold uppercase leading-tight text-offer-foreground sm:left-4 sm:top-20 sm:w-[42%] sm:max-w-40 sm:text-body-xl"
        title={mainName.trim()}
      >
        <span className="line-clamp-2 break-words">{mainName.trim()}</span>
      </h3>
      {subtitle && (
        <p className="absolute left-3 top-[7.5rem] lg:top-40 z-10 line-clamp-1 w-28 font-heading text-caption font-bold leading-normal text-offer-foreground sm:left-4 sm:top-36 sm:w-[42%] sm:max-w-40 sm:text-label" title={subtitle}>
          {subtitle}
        </p>
      )}

      <p className="absolute bottom-3 left-3 font-heading text-body-xl font-bold leading-none text-ds-accent sm:bottom-5 sm:left-4 sm:text-section-title">
        <span className="sr-only">Prezzo: </span>{product.price.toFixed(2)}€
      </p>
      <Button
        type="button"
        variant="primary"
        onClick={onAdd}
        disabled={!product.available}
        aria-label={product.available ? `Aggiungi ${product.name} al carrello` : `${product.name} non disponibile`}
        className="absolute bottom-3 right-3 h-11 min-w-28 px-4 py-1 text-body sm:bottom-4 sm:right-4 sm:h-11 sm:min-w-36 sm:px-6 sm:py-2 sm:text-body"
      >
        {product.available ? 'Aggiungi' : 'Non disponibile'}
      </Button>
    </article>
  )
}
