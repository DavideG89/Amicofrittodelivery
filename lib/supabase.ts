import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const getProjectScopedStorageKey = () => {
  try {
    const host = new URL(supabaseUrl).hostname.replace(/[^a-z0-9.-]/gi, '_')
    return `af-admin-auth-v1:${host}`
  } catch {
    return 'af-admin-auth-v1'
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Isola la sessione auth del progetto e previene conflitti con token legacy corrotti.
    storageKey: getProjectScopedStorageKey(),
  },
})

if (typeof window !== 'undefined') {
  void supabase.auth.getSession().then(async ({ error }) => {
    if (!error) return
    const message = String(error.message || '')
    const invalidRefreshToken =
      message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')
    if (!invalidRefreshToken) return

    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Ignore cleanup errors.
    }
  })
}

// Types
export type Category = {
  id: string
  name: string
  slug: string
  display_order: number
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  category_id: string
  name: string
  description?: string | null
  price: number
  image_url: string | null
  ingredients?: string | null
  allergens?: string | null
  available: boolean
  label: 'sconto' | 'novita' | null
  display_order: number
  created_at: string
  updated_at: string
}

export type StoreInfo = {
  id: string
  name: string
  address: string | null
  phone: string | null
  opening_hours: import('@/lib/order-schedule').OpeningHoursValue
  delivery_fee: number
  min_order_delivery: number
  updated_at: string
}

export type UpsellSettings = {
  id: string
  enabled: boolean
  product_ids: string[]
  max_items: number
  updated_at?: string
}

export type DiscountCode = {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number
  active: boolean
  valid_from: string
  valid_until: string | null
  created_at: string
}

export type OrderAdditionType = 'sauce' | 'extra'

export type OrderAddition = {
  id: string
  type: OrderAdditionType
  name: string
  price: number
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type OrderItem = {
  product_id: string
  name: string
  price: number
  quantity: number
  additions?: string | null
  additions_unit_price?: number | null
  additions_ids?: string[] | null
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export type Order = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  customer_address: string | null
  order_type: 'delivery' | 'takeaway'
  payment_method: 'cash' | 'card' | null
  items: OrderItem[]
  subtotal: number
  discount_code: string | null
  discount_amount: number
  delivery_fee: number
  total: number
  status: OrderStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type PublicOrder = {
  order_number: string
  order_type: 'delivery' | 'takeaway'
  payment_method: 'cash' | 'card' | null
  items: OrderItem[]
  subtotal: number
  discount_code: string | null
  discount_amount: number
  delivery_fee: number
  total: number
  status: OrderStatus
  created_at: string
  updated_at?: string
}
