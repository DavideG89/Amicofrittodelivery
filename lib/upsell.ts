import { supabase, type Category, type Product, type UpsellSettings } from '@/lib/supabase'
import { applyUpsellOverrideToProduct, normalizeUpsellProductOverrides } from '@/lib/upsell-overrides'

const productSelectColumns =
  'id, category_id, name, description, price, image_url, piece_options, available, label, display_order, created_at, updated_at'

const compareProductName = (a: Product, b: Product) =>
  a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

function isMissingProductOverridesColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = `${maybeError.message || ''} ${maybeError.details || ''} ${maybeError.hint || ''}`.toLowerCase()
  return maybeError.code === '42703' || (text.includes('product_overrides') && text.includes('column'))
}

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
    const [{ data: settingsData, error: settingsError }, { data: categoriesData }] = await Promise.all([
      supabase
        .from('upsell_settings')
        .select('id, enabled, product_ids, max_items, product_overrides')
        .eq('id', 'default')
        .maybeSingle(),
      supabase.from('categories').select('id, name, slug, display_order, created_at, updated_at'),
    ])

    let settings = (settingsData as UpsellSettings | null) || null
    if (settingsError) {
      if (!isMissingProductOverridesColumnError(settingsError)) throw settingsError

      const { data: fallbackSettings, error: fallbackError } = await supabase
        .from('upsell_settings')
        .select('id, enabled, product_ids, max_items')
        .eq('id', 'default')
        .maybeSingle()

      if (fallbackError) throw fallbackError
      settings = (fallbackSettings as UpsellSettings | null) || null
    }

    if (settings && !settings.enabled) return []
    const maxItems = settings?.max_items || 6
    const productOverrides = normalizeUpsellProductOverrides(settings?.product_overrides)

    let products: Product[] = []

    if (settings?.enabled && Array.isArray(settings.product_ids) && settings.product_ids.length > 0) {
      const { data } = await supabase
        .from('products')
        .select(productSelectColumns)
        .in('id', settings.product_ids)
      products = (data || []) as Product[]
    } else {
      const categoryIds = getFallbackUpsellCategoryIds((categoriesData || []) as Category[])
      if (categoryIds.length === 0) return []
      const { data } = await supabase
        .from('products')
        .select(productSelectColumns)
        .in('category_id', categoryIds)
        .order('display_order', { ascending: true })
      products = (data || []) as Product[]
    }

    const excludedIds = new Set(excludedProductIds)
    return mergeById(products)
      .map((product) => applyUpsellOverrideToProduct(product, productOverrides))
      .filter((product) => Boolean(product.available))
      .filter((product) => !excludedIds.has(product.id))
      .sort(compareProductName)
      .slice(0, maxItems)
  } catch {
    return []
  }
}
