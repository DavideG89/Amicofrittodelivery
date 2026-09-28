import { supabase } from '@/lib/supabase'

const categoryColumns = 'id, name, slug, display_order, ingredient_customization_enabled, created_at, updated_at'

// Solo lo schema precedente alle offerte consente il fallback: gli altri errori
// devono arrivare al chiamante, senza mascherare problemi di rete o autorizzazione.
export async function fetchCategories() {
  const result = await supabase
    .from('categories')
    .select(`${categoryColumns}, show_as_offers`)
    .order('display_order', { ascending: true })

  const missingOffersColumn = result.error
    && ['42703', 'PGRST204'].includes(result.error.code)
    && result.error.message.includes('show_as_offers')

  if (!missingOffersColumn) {
    return { ...result, offersSupported: !result.error }
  }

  const legacyResult = await supabase
    .from('categories')
    .select(categoryColumns)
    .order('display_order', { ascending: true })

  return {
    ...legacyResult,
    data: legacyResult.data?.map((category) => ({ ...category, show_as_offers: false })) ?? null,
    offersSupported: false,
  }
}
