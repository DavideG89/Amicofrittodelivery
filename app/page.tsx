'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'
import { ProductCard } from '@/components/product-card'
import { UpsellDialog } from '@/components/upsell-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Category, Product } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [triggerProduct, setTriggerProduct] = useState<Product | null>(null)
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([])

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

        setCategories(categoriesData || [])
        setProducts(productsData || [])
      } catch (error) {
        console.error('[v0] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getProductsByCategory = (categoryId: string) => {
    return products
      .filter(p => p.category_id === categoryId)
      .sort((a, b) => {
        // Products with label ('sconto' or 'novita') come first
        const aHasLabel = a.label ? 1 : 0
        const bHasLabel = b.label ? 1 : 0
        
        if (aHasLabel !== bHasLabel) {
          return bHasLabel - aHasLabel // Products with label first
        }
        
        // If both have label or both don't have label, maintain display_order
        return a.display_order - b.display_order
      })
  }

  const handleProductAdded = (product: Product, quantity: number) => {
    console.log('[v0] Product added to cart:', product.name, 'quantity:', quantity)
    
    // Find the category of the added product
    const productCategory = categories.find(c => c.id === product.category_id)
    
    // Trigger upsell only for Panini/Hamburger categories
    const shouldShowUpsell = productCategory && 
      (productCategory.slug === 'panini' || 
       productCategory.slug === 'hamburger' ||
       productCategory.name.toLowerCase().includes('panin') ||
       productCategory.name.toLowerCase().includes('hamburger'))
    
    if (shouldShowUpsell) {
      // Find complementary categories (Fritti, Bevande)
      const complementaryCategories = categories.filter(c => 
        c.slug === 'fritti' || 
        c.slug === 'bevande' ||
        c.name.toLowerCase().includes('fritt') ||
        c.name.toLowerCase().includes('bevand')
      )
      
      // Get products from complementary categories
      const suggestions = products.filter(p => 
        complementaryCategories.some(c => c.id === p.category_id) && 
        p.available
      ).slice(0, 6) // Max 6 suggestions
      
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

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <Header />
      
      <main className="container px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-balance">
            Benvenuto da Amico Fritto
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            I migliori fritti della città
          </p>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Nessuna categoria disponibile al momento.
            </p>
          </div>
        ) : (
          <Tabs defaultValue={categories[0]?.id} className="w-full">
            <div className="mb-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex w-auto min-w-full sm:w-full justify-start h-auto gap-2 bg-muted/50 p-2 rounded-lg">
                {categories.map((category) => (
                  <TabsTrigger 
                    key={category.id} 
                    value={category.id}
                    className="flex-shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {category.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {categories.map((category) => {
              const categoryProducts = getProductsByCategory(category.id)
              
              return (
                <TabsContent key={category.id} value={category.id} className="mt-0 space-y-6">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xl sm:text-2xl font-bold">{category.name}</h2>
                    <span className="text-sm text-muted-foreground">
                      {categoryProducts.length} {categoryProducts.length === 1 ? 'prodotto' : 'prodotti'}
                    </span>
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

      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        triggerProduct={triggerProduct}
        suggestedProducts={suggestedProducts}
      />
    </div>
  )
}
