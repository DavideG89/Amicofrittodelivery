'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, type Product, type UpsellSettings, type Category } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Save, Search, ListChecks, XCircle, ChevronDown } from 'lucide-react'

const DEFAULT_UPSELL_ID = 'default'
const DEFAULT_MAX_ITEMS = 6

const compareProductName = (a: Product, b: Product) =>
  a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

export default function UpsellPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [maxItems, setMaxItems] = useState(DEFAULT_MAX_ITEMS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const adminPages = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/dashboard/orders', label: 'Ordini' },
    { href: '/admin/dashboard/menu', label: 'Menu' },
    { href: '/admin/dashboard/upsell', label: 'Upsell' },
    { href: '/admin/dashboard/discounts', label: 'Sconti' },
    { href: '/admin/dashboard/settings', label: 'Impostazioni' },
  ]

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          { data: productsData, error: productsError },
          { data: settingsData },
          { data: categoriesData, error: categoriesError },
        ] =
          await Promise.all([
            supabase.from('products').select('id, category_id, name, price, image_url, available, label, display_order, created_at, updated_at'),
            supabase
              .from('upsell_settings')
              .select('id, enabled, product_ids, max_items')
              .eq('id', DEFAULT_UPSELL_ID)
              .maybeSingle(),
            supabase.from('categories').select('id, name, slug, display_order, created_at, updated_at'),
          ])

        if (productsError) throw productsError
        if (categoriesError) throw categoriesError

        const normalizedSettings = settingsData as UpsellSettings | null
        if (normalizedSettings) {
          setEnabled(Boolean(normalizedSettings.enabled))
          setMaxItems(normalizedSettings.max_items || DEFAULT_MAX_ITEMS)
          setSelectedIds(new Set(normalizedSettings.product_ids || []))
        }

        setProducts((productsData || []).sort(compareProductName))
        setCategories(categoriesData || [])
      } catch (error) {
        console.error('[v0] Error fetching upsell data:', error)
        toast.error('Errore nel caricamento delle impostazioni upsell')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const allowedCategoryIds = useMemo(() => {
    return new Set(
      categories
        .filter((category) => {
          const slug = category.slug?.toLowerCase() || ''
          const name = category.name?.toLowerCase() || ''
          return (
            slug === 'bevande' ||
            slug === 'fritti' ||
            name.includes('bevand') ||
            name.includes('fritt')
          )
        })
        .map((category) => category.id)
    )
  }, [categories])

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    const base = products.filter((product) => allowedCategoryIds.has(product.category_id))
    if (!term) return base
    return base.filter((product) => product.name.toLowerCase().includes(term))
  }, [products, query, allowedCategoryIds])

  const selectedCount = selectedIds.size

  const toggleProduct = (productId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(productId)
      else next.delete(productId)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredProducts.map((p) => p.id)))
  }

  const handleClear = () => {
    setSelectedIds(new Set())
  }

  const handleSave = async () => {
    try {
      const allowedIds = new Set(products.filter((p) => allowedCategoryIds.has(p.category_id)).map((p) => p.id))
      const filteredSelection = Array.from(selectedIds).filter((id) => allowedIds.has(id))

      const payload: Pick<UpsellSettings, 'id' | 'enabled' | 'max_items' | 'product_ids'> = {
        id: DEFAULT_UPSELL_ID,
        enabled,
        max_items: Math.max(1, Number(maxItems) || DEFAULT_MAX_ITEMS),
        product_ids: filteredSelection,
      }

      const { error } = await supabase
        .from('upsell_settings')
        .upsert(payload, { onConflict: 'id' })

      if (error) throw error

      toast.success('Impostazioni upsell salvate')
    } catch (error) {
      console.error('[v0] Error saving upsell settings:', error)
      toast.error('Errore nel salvataggio delle impostazioni')
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Upsell
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </h1>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {adminPages.map((page) => (
                  <DropdownMenuItem key={page.href} onSelect={() => router.push(page.href)}>
                    {page.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h1 className="hidden md:block text-3xl font-bold">Upsell</h1>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Upsell
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </h1>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {adminPages.map((page) => (
                  <DropdownMenuItem key={page.href} onSelect={() => router.push(page.href)}>
                    {page.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h1 className="hidden md:block text-3xl font-bold">Upsell</h1>
          <p className="text-muted-foreground">
            Scegli quali prodotti mostrare nel modale upsell
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Salva
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Impostazioni</CardTitle>
          <CardDescription>
            Abilita o disabilita l’upsell e limita il numero di prodotti mostrati.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="upsell-enabled">Upsell attivo</Label>
            <Switch
              id="upsell-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Label htmlFor="max-items" className="min-w-[120px]">Max prodotti</Label>
            <Input
              id="max-items"
              type="number"
              min={1}
              max={12}
              value={maxItems}
              onChange={(e) => setMaxItems(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prodotti ({selectedCount} selezionati)</CardTitle>
          <CardDescription>
            Seleziona i prodotti da mostrare nel modale upsell. Sono disponibili solo
            le categorie Bevande e Fritti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca prodotto..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleSelectAll}>
                <ListChecks className="mr-2 h-4 w-4" />
                Seleziona tutti
              </Button>
              <Button type="button" variant="outline" onClick={handleClear}>
                <XCircle className="mr-2 h-4 w-4" />
                Svuota
              </Button>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun prodotto trovato.</p>
          ) : (
            <div className="grid gap-3">
              {filteredProducts.map((product) => {
                const checked = selectedIds.has(product.id)
                return (
                  <label
                    key={product.id}
                    className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleProduct(product.id, Boolean(value))}
                    />
                    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          No img
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm sm:text-base">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.price.toFixed(2)}€ {product.available ? '• Disponibile' : '• Non disponibile'}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
