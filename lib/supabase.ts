import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  description: string | null
  price: number
  image_url: string | null
  ingredients: string | null
  allergens: string | null
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

export type OrderItem = {
  product_id: string
  name: string
  price: number
  quantity: number
}

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
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
}
