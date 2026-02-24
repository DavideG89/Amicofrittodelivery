import { supabase, type Category, type Product, type UpsellSettings } from '@/lib/supabase'

const productSelectColumns =
  'id, category_id, name, description, price, image_url, available, label, display_order, created_at, updated_at'

const compareProductName = (a: Product, b: Product) =>
  a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

const mergeById = (list: Product[]) =>
  Array.from(new Map(list.map((product) => [product.id, product])).values())

const getFallbackUpsellCategoryIds = (categories: Category[]) =>
  categories
    .filter((category) => {
      const slug = (category.slug || '').toLowerCase()
      const name = (category.name || '').toLowerCase()
      return slug.includes('fritt') || slug.includes('bevand') || name.includes('fritt') || name.includes('bevand')
    })
    .map((category) => category.id)

export async function fetchUpsellSuggestions(excludedProductIds: string[]) {
  try {
    const [{ data: settingsData }, { data: categoriesData }] = await Promise.all([
      supabase
        .from('upsell_settings')
        .select('id, enabled, product_ids, max_items')
        .eq('id', 'default')
        .maybeSingle(),
      supabase.from('categories').select('id, name, slug, display_order, created_at, updated_at'),
    ])

    const settings = (settingsData as UpsellSettings | null) || null
    if (settings && !settings.enabled) return []
    const maxItems = settings?.max_items || 6

    let products: Product[] = []

    if (settings?.enabled && Array.isArray(settings.product_ids) && settings.product_ids.length > 0) {
      const { data } = await supabase
        .from('products')
        .select(productSelectColumns)
        .in('id', settings.product_ids)
        .eq('available', true)
      products = (data || []) as Product[]
    } else {
      const categoryIds = getFallbackUpsellCategoryIds((categoriesData || []) as Category[])
      if (categoryIds.length === 0) return []
      const { data } = await supabase
        .from('products')
        .select(productSelectColumns)
        .in('category_id', categoryIds)
        .eq('available', true)
        .order('display_order', { ascending: true })
      products = (data || []) as Product[]
    }

    const excludedIds = new Set(excludedProductIds)
    return mergeById(products)
      .filter((product) => !excludedIds.has(product.id))
      .sort(compareProductName)
      .slice(0, maxItems)
  } catch {
    return []
  }
}
