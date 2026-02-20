import { createClient } from '@supabase/supabase-js'

// Hardcoded credentials for development - In production, use environment variables
const supabaseUrl = 'https://sghftuvrupaswqhdckvs.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaGZ0dXZydXBhc3dxaGRja3ZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODAzNjQsImV4cCI6MjA4Njc1NjM2NH0.zF5_0yIZFwt8wX-THYBY_hVl0p9wm19_c8kQFgwPf1A'

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
