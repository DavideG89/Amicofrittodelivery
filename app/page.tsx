'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { ProductCard } from '@/components/product-card'
import { UpsellDialog } from '@/components/upsell-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Category, Product, StoreInfo, UpsellSettings, Order } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { extractOpeningHours, formatNextOpen, getOrderStatus } from '@/lib/order-schedule'

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [triggerProduct, setTriggerProduct] = useState<Product | null>(null)
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([])
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [upsellSettings, setUpsellSettings] = useState<UpsellSettings | null>(null)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderActive, setLastOrderActive] = useState(false)
  const [lastOrderStatus, setLastOrderStatus] = useState<Order['status'] | null>(null)
  const [lastOrderLoading, setLastOrderLoading] = useState(false)
  const categoryTopRef = useRef<HTMLDivElement>(null)

  const getOrderStatusLabel = (status: Order['status'] | null) => {
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

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('*')
          .order('display_order', { ascending: true })

        if (categoriesError) throw categoriesError

        // Fetch products
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .order('display_order', { ascending: true })

        if (productsError) throw productsError

        const { data: storeInfoData, error: storeInfoError } = await supabase
          .from('store_info')
          .select('*')
          .limit(1)
          .maybeSingle()

        if (storeInfoError) throw storeInfoError

        const { data: upsellSettingsData } = await supabase
          .from('upsell_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle()

        setCategories(categoriesData || [])
        setProducts(productsData || [])
        setStoreInfo(storeInfoData || null)
        setUpsellSettings(upsellSettingsData || null)
      } catch (error) {
        console.error('[v0] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

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
    setLastOrderLoading(true)
    supabase
      .from('orders')
      .select('status')
      .eq('order_number', lastOrderNumber)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setLastOrderStatus((data?.status as Order['status']) || null)
      })
      .catch(() => {
        if (cancelled) return
        setLastOrderStatus(null)
      })
      .finally(() => {
        if (cancelled) return
        setLastOrderLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lastOrderNumber])


  const compareProductName = (a: Product, b: Product) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

  const getProductsByCategory = (categoryId: string) => {
    return products
      .filter(p => p.category_id === categoryId)
      .sort(compareProductName)
  }

  const handleProductAdded = (product: Product, quantity: number) => {
    console.log('[v0] Product added to cart:', product.name, 'quantity:', quantity)
    
    // Find the category of the added product
    const productCategory = categories.find(c => c.id === product.category_id)
    
    // Trigger upsell for Panini/Hamburger/Mini Burger categories
    const categoryName = productCategory?.name.toLowerCase() || ''
    const categorySlug = productCategory?.slug || ''
    const shouldShowUpsell = productCategory && 
      (categorySlug === 'panini' || 
       categorySlug === 'hamburger' ||
       categorySlug === 'mini-burger' ||
       categoryName.includes('panin') ||
       categoryName.includes('hamburger') ||
       categoryName.includes('mini burger'))
    
    if (shouldShowUpsell) {
      const useCustomUpsell =
        upsellSettings?.enabled &&
        Array.isArray(upsellSettings.product_ids) &&
        upsellSettings.product_ids.length > 0

      if (useCustomUpsell) {
        const maxItems = upsellSettings.max_items || 6
        const allowedIds = new Set(upsellSettings.product_ids)
        const suggestions = products
          .filter((p) => p.available && allowedIds.has(p.id))
          .sort(compareProductName)
          .slice(0, maxItems)

        if (suggestions.length > 0) {
          setTriggerProduct(product)
          setSuggestedProducts(suggestions)
          setUpsellOpen(true)
        }
        return
      }

      // Find complementary categories (Fritti, Bevande)
      const complementaryCategories = categories.filter(c => 
        c.slug === 'fritti' || 
        c.slug === 'bevande' ||
        c.name.toLowerCase().includes('fritt') ||
        c.name.toLowerCase().includes('bevand')
      )
      
      // Get products from complementary categories
      const suggestions = products
        .filter(p => 
          complementaryCategories.some(c => c.id === p.category_id) && 
          p.available
        )
        .sort(compareProductName)
        .slice(0, 6) // Max 6 suggestions
      
      if (suggestions.length > 0) {
        setTriggerProduct(product)
        setSuggestedProducts(suggestions)
        setUpsellOpen(true)
      }
    }
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
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <p className="font-medium">
              Ordinazioni chiuse.{nextOpenLabel ? ` Riapriamo alle ${nextOpenLabel}.` : ''}
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
            defaultValue={categories[0]?.id}
            className="w-full"
            onValueChange={() => {
              categoryTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            <div className="sticky top-16 z-40 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur md:static md:top-auto">
              <div className="h-14 flex items-center">
                <div className="overflow-x-auto w-full">
                  <TabsList className="inline-flex w-max min-w-max sm:w-full sm:min-w-full justify-start h-auto gap-1.5 rounded-2xl border border-muted/60 bg-background/70 p-1.5 shadow-sm backdrop-blur">
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
            </div>

            <div ref={categoryTopRef} className="scroll-mt-[7.5rem]" />

            {categories.map((category) => {
              const categoryProducts = getProductsByCategory(category.id)
              
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
                  
                  {categoryProducts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-12 text-sm sm:text-base">
                      Nessun prodotto disponibile in questa categoria.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {categoryProducts.map((product) => (
                        <ProductCard 
                          key={product.id} 
                          product={product}
                          onAddToCart={handleProductAdded}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </main>

      {lastOrderNumber && lastOrderStatus !== 'completed' && lastOrderStatus !== 'cancelled' && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4">
          <div className="mx-auto max-w-7xl rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-900 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm sm:text-base">
                {lastOrderLoading && 'Stato ordine in aggiornamento...'}
                {!lastOrderLoading &&
                  lastOrderStatus &&
                  `Stato ordine: ${getOrderStatusLabel(lastOrderStatus) || lastOrderStatus}`}
                {!lastOrderLoading && !lastOrderStatus && 'Stato ordine non disponibile'}
              </p>
            </div>
          </div>
        </div>
      )}

      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        triggerProduct={triggerProduct}
        suggestedProducts={suggestedProducts}
      />
    </div>
  )
}
