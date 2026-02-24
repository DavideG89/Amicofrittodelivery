'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { ProductCard } from '@/components/product-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Category, Product, StoreInfo, OrderStatus } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { extractOpeningHours, formatNextOpen, getOrderStatus } from '@/lib/order-schedule'

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([])
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({})
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderActive, setLastOrderActive] = useState(false)
  const [lastOrderStatus, setLastOrderStatus] = useState<OrderStatus | null>(null)
  const [lastOrderLoading, setLastOrderLoading] = useState(false)
  const categoryTopRef = useRef<HTMLDivElement>(null)
  const cacheKey = 'af:home-cache:v3'
  const cacheTtlMs = 10 * 60 * 1000
  const sortCategories = (list: Category[]) => {
    const desiredOrder = ['hamburger', 'mini' ,'panini', 'kebab', 'fritti', 'salse', 'bevande']
    const getSortKey = (category: Category) => {
      const slug = (category.slug || '').toLowerCase()
      const name = (category.name || '').toLowerCase()
      const idx =
        desiredOrder.indexOf(slug) !== -1
          ? desiredOrder.indexOf(slug)
          : desiredOrder.findIndex((key) => name.includes(key))
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }

    return [...list].sort((a, b) => {
      const aKey = getSortKey(a)
      const bKey = getSortKey(b)
      if (aKey !== bKey) return aKey - bKey
      return (a.display_order ?? 0) - (b.display_order ?? 0)
    })
  }

  const getOrderStatusLabel = (status: OrderStatus | null) => {
    switch (status) {
      case 'pending':
        return 'In attesa'
      case 'confirmed':
        return 'Confermato'
      case 'preparing':
        return 'In preparazione'
      case 'ready':
        return 'in consegna'
      case 'completed':
        return 'Completato'
      case 'cancelled':
        return 'Annullato'
      default:
        return null
    }
  }

  const dismissLastOrder = () => {
    try {
      localStorage.setItem('lastOrderActive', 'false')
    } catch {
      // ignore storage errors
    }
    setLastOrderActive(false)
  }

  const fetchProductsForCategory = async (categoryId: string) => {
    if (!categoryId) return
    if (productsByCategory[categoryId]) return
    const { data, error } = await supabase
      .from('products')
      .select('id, category_id, name, price, image_url, available, label, display_order, created_at, updated_at')
      .eq('category_id', categoryId)
      .order('display_order', { ascending: true })
    if (error) {
      console.error('[v0] Products fetch error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      return
    }
    setProductsByCategory((prev) => ({ ...prev, [categoryId]: data || [] }))
  }

  useEffect(() => {
    async function fetchData() {
      try {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem(cacheKey)
          if (raw) {
            try {
          const cached = JSON.parse(raw) as {
                ts: number
                categories: Category[]
                productsByCategory: Record<string, Product[]>
                storeInfo: StoreInfo | null
                activeCategory: string | null
              }
              if (Date.now() - cached.ts < cacheTtlMs) {
                const sortedCachedCategories = sortCategories(cached.categories || [])
                setCategories(sortedCachedCategories)
                setProductsByCategory(cached.productsByCategory || {})
                setStoreInfo(cached.storeInfo || null)
                const cachedActive = cached.activeCategory ?? sortedCachedCategories?.[0]?.id ?? null
                setActiveCategory(cachedActive)
                setLoading(false)
                if (cachedActive && !cached.productsByCategory?.[cachedActive]) {
                  void fetchProductsForCategory(cachedActive)
                }
                return
              }
            } catch {
              // ignore cache errors
            }
          }
        }
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, display_order, created_at, updated_at')
          .order('display_order', { ascending: true })

        if (categoriesError) {
          console.error('[v0] Categories fetch error:', {
            message: categoriesError.message,
            details: categoriesError.details,
            hint: categoriesError.hint,
            code: categoriesError.code,
          })
          throw categoriesError
        }

        const { data: storeInfoData, error: storeInfoError } = await supabase
          .from('store_info')
          .select('id, name, address, phone, opening_hours, delivery_fee, min_order_delivery, updated_at')
          .limit(1)
          .maybeSingle()

        if (storeInfoError) {
          console.error('[v0] Store info fetch error:', {
            message: storeInfoError.message,
            details: storeInfoError.details,
            hint: storeInfoError.hint,
            code: storeInfoError.code,
          })
          throw storeInfoError
        }

        const sortedCategories = sortCategories(categoriesData || [])

        setCategories(sortedCategories)
        setStoreInfo(storeInfoData || null)
        const firstCategory = sortedCategories?.[0]?.id ?? null
        setActiveCategory(firstCategory)
        if (firstCategory) {
          void fetchProductsForCategory(firstCategory)
        }
      } catch (error) {
        const err = error as { message?: string; name?: string; stack?: string }
        console.error('[v0] Error fetching data:', {
          message: err?.message,
          name: err?.name,
          stack: err?.stack,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (categories.length === 0) return
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          ts: Date.now(),
          categories,
          productsByCategory,
          storeInfo,
          activeCategory,
        })
      )
    } catch {
      // ignore storage errors
    }
  }, [categories, productsByCategory, storeInfo, activeCategory])

  useEffect(() => {
    try {
      const number = localStorage.getItem('lastOrderNumber')
      const active = localStorage.getItem('lastOrderActive') === 'true'
      setLastOrderNumber(number)
      setLastOrderActive(active)
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (!lastOrderNumber) return
    let cancelled = false
    const clearLastOrder = () => {
      try {
        localStorage.removeItem('lastOrderNumber')
        localStorage.removeItem('lastOrderActive')
      } catch {
        // ignore storage errors
      }
      if (cancelled) return
      setLastOrderNumber(null)
      setLastOrderActive(false)
      setLastOrderStatus(null)
    }

    const refreshStatus = async () => {
      setLastOrderLoading(true)
      try {
        const { data } = await supabase
          .from('orders_public')
          .select('status')
          .eq('order_number', lastOrderNumber)
          .single()
        if (cancelled) return
        if (!data?.status) {
          clearLastOrder()
          return
        }
        setLastOrderStatus(data.status as OrderStatus)
      } catch {
        if (cancelled) return
        clearLastOrder()
      } finally {
        if (cancelled) return
        setLastOrderLoading(false)
      }
    }

    void refreshStatus()

    return () => {
      cancelled = true
    }
  }, [lastOrderNumber])

  const handleRefreshLastOrder = async () => {
    if (!lastOrderNumber || lastOrderLoading) return
    setLastOrderLoading(true)
    try {
      const { data } = await supabase
        .from('orders_public')
        .select('status')
        .eq('order_number', lastOrderNumber)
        .single()
      if (!data?.status) {
        try {
          localStorage.removeItem('lastOrderNumber')
          localStorage.removeItem('lastOrderActive')
        } catch {
          // ignore storage errors
        }
        setLastOrderNumber(null)
        setLastOrderActive(false)
        setLastOrderStatus(null)
        return
      }
      setLastOrderStatus(data.status as OrderStatus)
    } catch {
      try {
        localStorage.removeItem('lastOrderNumber')
        localStorage.removeItem('lastOrderActive')
      } catch {
        // ignore storage errors
      }
      setLastOrderNumber(null)
      setLastOrderActive(false)
      setLastOrderStatus(null)
    } finally {
      setLastOrderLoading(false)
    }
  }


  const compareProductName = (a: Product, b: Product) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

  const getProductsByCategory = (categoryId: string) => {
    return (productsByCategory[categoryId] || []).sort(compareProductName)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-6">
          <div className="grid gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  const { schedule } = extractOpeningHours(storeInfo?.opening_hours ?? null)
  const orderStatus = getOrderStatus(schedule)
  const nextOpenLabel = formatNextOpen(orderStatus.nextOpen)
  const showLastOrderSticky = Boolean(lastOrderNumber) && lastOrderStatus !== 'completed'
  const isCancelledLastOrder = lastOrderStatus === 'cancelled'

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <Header />
      
      <main className="container px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-balance">
            Benvenuto da Amico Fritto
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Scopri il nostro menù e ordina i tuoi sfizi preferiti in pochi click!
          </p>
        </div>

        {lastOrderNumber && !lastOrderActive && lastOrderStatus !== 'completed' && lastOrderStatus !== 'cancelled' && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">Hai un ordine recente.</p>
              <div className="flex items-center gap-2">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
                  href={`/order/${lastOrderNumber}`}
                >
                  Riprendi ordine
                </Link>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-blue-300 bg-white px-3 text-sm font-medium text-blue-900 hover:bg-blue-100"
                  onClick={dismissLastOrder}
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        )}

        {!orderStatus.isOpen && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-center">
            <p className="font-medium">
              Ordinazioni chiuse.{nextOpenLabel ? ` Riapriamo ${nextOpenLabel}.` : ''}
            </p>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Nessuna categoria disponibile al momento.
            </p>
          </div>
        ) : (
          <Tabs
            value={activeCategory ?? categories[0]?.id}
            className="w-full"
            onValueChange={(value) => {
              setActiveCategory(value)
              void fetchProductsForCategory(value)
              categoryTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            <div className="sticky top-16 z-40 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur md:static md:top-auto">
              <div className="overflow-x-auto w-full no-scrollbar py-2">
                <TabsList className="inline-flex w-max min-w-max sm:w-full sm:min-w-full justify-start h-auto gap-1.5 rounded-2xl bg-background/70 p-1.5 shadow-sm backdrop-blur">
                  {categories.map((category) => (
                    <TabsTrigger 
                      key={category.id} 
                      value={category.id}
                      className="flex-shrink-0 max-w-[10rem] sm:max-w-none truncate rounded-xl px-3 sm:px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm"
                    >
                      {category.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <div ref={categoryTopRef} className="scroll-mt-[7.5rem]" />

            {categories.map((category) => {
              const categoryProducts = getProductsByCategory(category.id)
              const isActiveCategory =
                (activeCategory ?? categories[0]?.id) === category.id
              const isCategoryLoading = isActiveCategory && !productsByCategory[category.id]
              
              return (
                <TabsContent key={category.id} value={category.id} className="mt-0 space-y-6">
                  <div className="sticky top-[7.5rem] z-30 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur border-b border-muted/40 py-2 sm:static sm:top-auto sm:bg-transparent sm:backdrop-blur-0 sm:border-0 sm:py-0">
                    <div className="flex items-baseline justify-between">
                    <h2 className="text-xl sm:text-2xl font-bold">{category.name}</h2>
                    <span className="text-sm text-muted-foreground">
                      {categoryProducts.length} {categoryProducts.length === 1 ? 'prodotto' : 'prodotti'}
                    </span>
                    </div>
                  </div>
                  
                  {isCategoryLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64 w-full" />
                      ))}
                    </div>
                  ) : categoryProducts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-12 text-sm sm:text-base">
                      Nessun prodotto disponibile in questa categoria.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {categoryProducts.map((product) => {
                        const slug = (category.slug || '').toLowerCase()
                        const categoryName = (category.name || '').toLowerCase()
                        const isSaucesCategory =
                          slug === 'salse' ||
                          categoryName.includes('salse') ||
                          categoryName.includes('salsa')
                        const isDrinksCategory =
                          slug === 'bevande' ||
                          categoryName.includes('bevande') ||
                          categoryName.includes('bevanda')
                        return (
                          <ProductCard
                            key={product.id}
                            product={product}
                            imageFit={isSaucesCategory ? 'contain' : 'cover'}
                            skipAdditions={isSaucesCategory || isDrinksCategory}
                          />
                        )
                      })}
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </main>

      {showLastOrderSticky && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4">
          <div
            className={`mx-auto max-w-7xl rounded-2xl border px-4 py-2 shadow-sm ${
              isCancelledLastOrder
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 sm:justify-start justify-center">
                {isCancelledLastOrder ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-500 text-[10px]">
                    !
                  </span>
                ) : (
                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                )}
                <p className="text-sm sm:text-base text-center sm:text-left">
                  {lastOrderLoading && 'Stato ordine in aggiornamento...'}
                  {!lastOrderLoading &&
                    lastOrderStatus &&
                    `Stato ordine: ${getOrderStatusLabel(lastOrderStatus) || lastOrderStatus}`}
                  {!lastOrderLoading && !lastOrderStatus && 'Stato ordine non disponibile'}
                </p>
              </div>
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs font-medium disabled:opacity-60 ${
                  isCancelledLastOrder
                    ? 'border-red-300 text-red-900 hover:bg-red-100'
                    : 'border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                }`}
                onClick={handleRefreshLastOrder}
                disabled={lastOrderLoading}
              >
                Aggiorna stato
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
