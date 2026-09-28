'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'
import type { Category, Product } from '@/lib/supabase'

type OffersSectionProps = {
  categories: Category[]
  productsByCategory: Record<string, Product[]>
}

export function OffersSection({ categories, productsByCategory }: OffersSectionProps) {
  const [api, setApi] = useState<CarouselApi>()
  const [selected, setSelected] = useState(0)
  const [snapCount, setSnapCount] = useState(0)
  const loading = categories.some((category) => !productsByCategory[category.id])
  const offers = categories.flatMap((category) =>
    (productsByCategory[category.id] || [])
      .filter((product) => product.available)
      .map((product) => ({ category, product })),
  )

  useEffect(() => {
    if (!api) return
    const sync = () => {
      setSelected(api.selectedScrollSnap())
      setSnapCount(api.scrollSnapList().length)
    }
    sync()
    api.on('select', sync)
    api.on('reInit', sync)
    return () => {
      api.off('select', sync)
      api.off('reInit', sync)
    }
  }, [api])

  return (
    <section aria-labelledby="offers-heading" className="mx-auto mb-6 lg:mb-0 w-full lg:w-full bg-offer-section lg:pb-0 lg:pl-0 pb-4 pl-4 text-offer-foreground">
     <div className="relative h-[420px] lg:h-[450px]">
      <div className="relative mb-4 flex min-h-[71px] items-center lg:pl-80">
        <Image src="/offers/star.svg" alt="" aria-hidden="true" width={54} height={53} className="absolute left-[190px] lg:left-[510px] top-[9px] h-[53px] w-[54px]" />
        <h2 id="offers-heading" className="relative text-body-lg font-bold uppercase leading-8">Offerte del momento</h2>
      </div>
      {loading && offers.length === 0 ? (
        <Skeleton className="h-[300px] w-full" aria-label="Caricamento offerte" />
      ) : offers.length === 0 ? (
        <p className="px-4 pb-4 text-label">Nessuna offerta disponibile al momento.</p>
      ) : (
        <Carousel setApi={setApi} opts={{ align: 'start', containScroll: 'trimSnaps' }} aria-label="Offerte del momento">
          <CarouselContent className="-ml-2 pb-2">
            {offers.map(({ category, product }, index) => (
              <CarouselItem key={product.id} className="basis-[98%] pl-2 sm:basis-[400px]" aria-label={`${index + 1} di ${offers.length}`}>
                <ProductCard
                  variant="offer"
                  product={product}
                  categorySlug={category.slug}
                  skipAdditions
                  ingredientCustomizationEnabled={category.ingredient_customization_enabled}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          {snapCount > 1 && (
            <div className="flex flex-wrap justify-center" aria-label="Navigazione offerte">
              {Array.from({ length: snapCount }, (_, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="link"
                  size="icon"
                  className="h-8 w-6 hover:bg-transparent"
                  aria-label={`Vai al gruppo offerte ${index + 1}`}
                  aria-current={selected === index ? 'true' : undefined}
                  onClick={() => api?.scrollTo(index)}
                >
                  <span className={`h-3 w-3 rounded-full border border-offer-cheddar ${selected === index ? 'bg-offer-cheddar' : 'bg-transparent'}`} />
                </Button>
              ))}
            </div>
          )}
        </Carousel>
      )}
      </div>
    </section>
  )
}
