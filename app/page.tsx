'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { ProductCard } from '@/components/product-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { normalizeOrderNumber } from '@/lib/order-number'
import { supabase, Category, Product, StoreInfo, OrderStatus } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { extractOpeningHours, formatNextOpen, getOrderStatus } from '@/lib/order-schedule'
import { fetchPublicOrderLight } from '@/lib/public-order-client'
import { subscribeToStoreInfo } from '@/lib/store-info-sync'

const ORDER_TERMINAL_STATUS_EVENT = 'af:order-terminal-status'
const HOME_PRODUCTS_READY_EVENT = 'af:home-products-ready'
const CATEGORY_ICONS = {
  mini: '/icons/cheeseburger-v2.png',
  hamburger: '/icons/Products_Hamburger.png',
  panini: '/icons/Products_Sandwich.png',
  kebab: '/icons/Products_Kebab.png',
  fritti: '/icons/Products_Fritti.png',
  salse: '/icons/Products_Salse.png',
  bevande: '/icons/Products_Bevande.png',
} as const
const CHICKEN_BURGER_NAME_OVERRIDES = ['deluxe']

function getCategoryIconPath(category: Category): string | null {
  const text = `${category.slug || ''} ${category.name || ''}`.toLowerCase()
  if (text.includes('mini')) return CATEGORY_ICONS.mini
  if (text.includes('hamburger') || text.includes('burger')) return CATEGORY_ICONS.hamburger
  if (text.includes('panini') || text.includes('sandwich')) return CATEGORY_ICONS.panini
  if (text.includes('kebab')) return CATEGORY_ICONS.kebab
  if (text.includes('fritti')) return CATEGORY_ICONS.fritti
  if (text.includes('salse')) return CATEGORY_ICONS.salse
  if (text.includes('bevande') || text.includes('bevanda')) return CATEGORY_ICONS.bevande
  return null
}

export default function Home() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({})
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderStatus, setLastOrderStatus] = useState<OrderStatus | null>(null)
  const [lastOrderLoading, setLastOrderLoading] = useState(false)
  const cacheKey = 'af:home-cache:v4'
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

  const notifyTerminalStatus = (orderNumber: string, status: OrderStatus) => {
    if (typeof window === 'undefined') return
    if (status !== 'completed' && status !== 'cancelled') return
    window.dispatchEvent(
      new CustomEvent(ORDER_TERMINAL_STATUS_EVENT, {
        detail: { orderNumber, status },
      })
    )
  }

  const fetchProductsForCategory = async (categoryId: string) => {
    if (!categoryId) return
    if (productsByCategory[categoryId]) return
    const { data, error } = await supabase
      .from('products')
      .select('id, category_id, name, ingredients, price, image_url, piece_options, available, label, display_order, created_at, updated_at')
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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(HOME_PRODUCTS_READY_EVENT))
        }
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToStoreInfo({
      onUpdate: (nextStoreInfo) => {
        setStoreInfo(nextStoreInfo)
      },
      onError: (error) => {
        console.error('[home] Store info sync error:', error)
      },
    })

    return () => {
      unsubscribe()
    }
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
      const number = normalizeOrderNumber(localStorage.getItem('lastOrderNumber'))
      setLastOrderNumber(number || null)
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
      setLastOrderStatus(null)
    }

    const refreshStatus = async () => {
      setLastOrderLoading(true)
      try {
        const data = await fetchPublicOrderLight(lastOrderNumber)
        if (cancelled) return
        if (!data) {
          clearLastOrder()
          return
        }
        setLastOrderStatus(data.status as OrderStatus)
        notifyTerminalStatus(data.order_number, data.status as OrderStatus)
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

  useEffect(() => {
    const onTerminalStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ orderNumber?: string; status?: string }>)?.detail
      const number = normalizeOrderNumber(detail?.orderNumber || '')
      const status = String(detail?.status || '')
      if (!number || (status !== 'completed' && status !== 'cancelled')) return
      if (lastOrderNumber && number !== lastOrderNumber) return
      setLastOrderStatus(status as OrderStatus)
    }

    window.addEventListener(ORDER_TERMINAL_STATUS_EVENT, onTerminalStatus as EventListener)
    return () => {
      window.removeEventListener(ORDER_TERMINAL_STATUS_EVENT, onTerminalStatus as EventListener)
    }
  }, [lastOrderNumber])

  const handleViewLastOrder = () => {
    if (!lastOrderNumber) return
    router.push(`/order/${encodeURIComponent(lastOrderNumber)}`)
  }


  const compareProductName = (a: Product, b: Product) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

  const isHamburgerCategory = (category: Category) => {
    const text = `${category.slug || ''} ${category.name || ''}`.toLowerCase()
    return text.includes('hamburger') || text.includes('burger')
  }

  const isChickenBurger = (product: Product) => {
    const productName = `${product.name || ''}`.toLowerCase()
    if (CHICKEN_BURGER_NAME_OVERRIDES.some((name) => productName.includes(name))) {
      return true
    }
    const text = `${product.name || ''} ${product.ingredients || ''}`.toLowerCase()
    return text.includes('pollo') || text.includes('chicken')
  }

  const getProductsByCategory = (categoryId: string) => {
    return (productsByCategory[categoryId] || []).sort(compareProductName)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Script
          id="adsense-homepage"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3933984807301661"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
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
  const showLastOrderSticky =
    Boolean(lastOrderNumber) &&
    lastOrderStatus !== 'completed' &&
    lastOrderStatus !== 'cancelled'
  const isCancelledLastOrder = lastOrderStatus === 'cancelled'

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <Script
        id="adsense-homepage"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3933984807301661"
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
      <Header />
      
      <main className="container px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="mb-2 text-center space-y-2">
          <h1 className="text-[24px] lg:text-5xl font-bold text-balance">
            Benvenuto da Amico Fritto
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg md:text-lg">
            Scopri i tuoi nuovi sfizi in pochi click
          </p>
        </div>

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
            }}
          >
            <div className="sticky top-16 z-40 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur md:static md:top-auto">
              <div className="overflow-x-auto w-full no-scrollbar py-2">
                <TabsList className="inline-flex w-max min-w-max sm:w-full sm:min-w-full justify-start h-auto gap-1.5 rounded-2xl bg-background/70 p-1.5 shadow-sm backdrop-blur">
                  {categories.map((category) => {
                    const iconPath = getCategoryIconPath(category)
                    const isActiveTab = (activeCategory ?? categories[0]?.id) === category.id
                    return (
                      <TabsTrigger
                        key={category.id}
                        value={category.id}
                        className="relative flex h-[6rem] w-[6.7rem] flex-shrink-0 sm:h-auto sm:w-auto truncate rounded-xl px-2.5 sm:px-4 py-2 text-md font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:data-[state=active]:bg-foreground sm:data-[state=active]:text-background sm:data-[state=active]:shadow-sm"
                      >
                        {isActiveTab && (
                          <Image
                            src="/Star.svg"
                            alt=""
                            aria-hidden="true"
                            width={58}
                            height={58}
                            className="pointer-events-none absolute left-1/2 top-1/2 h-[80px] w-[80px] -translate-x-1/2 -translate-y-14 rotate-[-15deg] object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)] sm:hidden"
                          />
                        )}
                        <span className="relative z-10 inline-flex flex-col items-center gap-1">
                          {iconPath && (
                            <span className="relative inline-flex h-12 w-12 sm:h-8 sm:w-8 shrink-0 items-center justify-center">
                              <Image
                                src={iconPath}
                                alt=""
                                aria-hidden="true"
                                width={20}
                                height={20}
                                className={`relative z-10 h-full w-full transition-transform duration-200 ${isActiveTab ? 'rotate-[20deg]' : 'rotate-0'}`}
                              />
                            </span>
                          )}
                          <span className="text-center truncate">{category.name}</span>
                        </span>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>
            </div>

            {categories.map((category) => {
              const categoryProducts = getProductsByCategory(category.id)
              const isActiveCategory =
                (activeCategory ?? categories[0]?.id) === category.id
              const isCategoryLoading = isActiveCategory && !productsByCategory[category.id]
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
              const isFriedCategory =
                slug === 'fritti' ||
                categoryName.includes('fritti') ||
                categoryName.includes('fritto')
              const isBurgerCategory = isHamburgerCategory(category)
              const chickenBurgers = isBurgerCategory
                ? categoryProducts.filter((product) => isChickenBurger(product))
                : []
              const meatBurgers = isBurgerCategory
                ? categoryProducts.filter((product) => !isChickenBurger(product))
                : []

              const renderProductsGrid = (products: Product[]) => (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categorySlug={category.slug}
                      imageFit={isSaucesCategory ? 'contain' : 'cover'}
                      skipAdditions={isSaucesCategory || isDrinksCategory}
                      saucesOnly={isFriedCategory}
                      forceFreeSingleSauce={isFriedCategory}
                    />
                  ))}
                </div>
              )
              
              return (
                <TabsContent key={category.id} value={category.id} className="mt-0 space-y-0">
                  <div className="sticky top-[11.5rem] z-30 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur border-b border-muted/40 py-2  sm:bg-transparent sm:backdrop-blur-0 sm:border-0 sm:py-0 lg:static lg:top-auto">
                    <div className="flex items-baseline justify-between">
                    <h2 className="font-bold text-2xl sm:text-xl">{category.name}</h2>
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
                  ) : isBurgerCategory ? (
                    <div className="space-y-8">
                      {meatBurgers.length > 0 && (
                        <section className="space-y-3">
                          <h3 className=" sticky top-[14.5rem] z-10 bg-background/95 backdrop-blur sm:bg-transparent sm:backdrop-blur-0 text-xl sm:text-3xl font-semibold px-2 py-2 md:top-[4rem] md:z-10 md:bg-background/95 md:backdrop-blur">Carne</h3>
                          {renderProductsGrid(meatBurgers)}
                        </section>
                      )}
                      {chickenBurgers.length > 0 && (
                        <section className="space-y-3">
                          <h3 className="sticky top-[14.5rem] z-10 bg-background/95 backdrop-blur sm:bg-transparent sm:backdrop-blur-0 text-xl sm:text-3xl font-semibold px-2 py-2 md:top-[4rem] md:z-10 md:bg-background/95 md:backdrop-blur">Pollo</h3>
                          {renderProductsGrid(chickenBurgers)}
                        </section>
                      )}
                    </div>
                  ) : (
                    renderProductsGrid(categoryProducts)
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
                className={`inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs font-medium ${
                  isCancelledLastOrder
                    ? 'border-red-300 text-red-900 hover:bg-red-100'
                    : 'border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                }`}
                onClick={handleViewLastOrder}
              >
                Visualizza stato
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
