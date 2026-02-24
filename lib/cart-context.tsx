'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Product } from './supabase'

export type CartItem = {
  product: Product
  quantity: number
  additions?: string
  additions_unit_price?: number
  additions_ids?: string[]
}

type AddItemOptions = {
  additions?: string
  additionsUnitPrice?: number
  additionsIds?: string[]
}

type CartContextType = {
  items: CartItem[]
  addItem: (product: Product, options?: string | AddItemOptions) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)
const CART_STORAGE_KEY = 'amico-fritto-cart'

type StoredCartItem = {
  product: {
    id: string
    name: string
    price: number
    image_url: string | null
  }
  quantity: number
  additions?: string
  additions_unit_price?: number
  additions_ids?: string[]
}

const toSafeProductForStorage = (product: Product): StoredCartItem['product'] => ({
  id: product.id,
  name: product.name,
  price: Number(product.price) || 0,
  // Evita di salvare data URL / stringhe enormi che saturano il quota storage.
  image_url:
    typeof product.image_url === 'string' && product.image_url.length <= 512
      ? product.image_url
      : null,
})

const hydrateProduct = (stored: StoredCartItem['product']): Product => ({
  id: stored.id,
  name: stored.name,
  price: Number(stored.price) || 0,
  image_url: stored.image_url,
  category_id: '',
  description: null,
  ingredients: null,
  allergens: null,
  available: true,
  label: null,
  display_order: 0,
  created_at: '',
  updated_at: '',
})

const normalizeStoredCart = (raw: unknown): CartItem[] => {
  if (!Array.isArray(raw)) return []
  const normalized: Array<CartItem | null> = raw
    .map((entry) => {
      const item = entry as Partial<CartItem & StoredCartItem>
      const storedProduct = item.product as StoredCartItem['product'] | Product | undefined
      if (!storedProduct || typeof storedProduct.id !== 'string') return null
      const normalizedQuantity = Number(item.quantity)
      const quantity =
        Number.isFinite(normalizedQuantity) && normalizedQuantity > 0
          ? Math.floor(normalizedQuantity)
          : 0
      if (quantity <= 0) return null
      const hasFullProductShape =
        'category_id' in storedProduct &&
        'available' in storedProduct &&
        'display_order' in storedProduct
      const product = hasFullProductShape
        ? (storedProduct as Product)
        : hydrateProduct({
            id: storedProduct.id,
            name: typeof storedProduct.name === 'string' ? storedProduct.name : 'Prodotto',
            price: Number((storedProduct as { price?: unknown }).price) || 0,
            image_url:
              typeof (storedProduct as { image_url?: unknown }).image_url === 'string'
                ? (storedProduct as { image_url: string }).image_url
                : null,
          })

      return {
        product,
        quantity,
        additions: typeof item.additions === 'string' ? item.additions : '',
        additions_unit_price: Number.isFinite(Number(item.additions_unit_price))
          ? Number(item.additions_unit_price)
          : 0,
        additions_ids: Array.isArray(item.additions_ids)
          ? item.additions_ids.filter((id): id is string => typeof id === 'string')
          : [],
      }
    })
  return normalized.filter((item): item is CartItem => item !== null)
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      if (!savedCart) return
      const parsed = JSON.parse(savedCart) as unknown
      setItems(normalizeStoredCart(parsed))
    } catch (e) {
      console.error('Failed to parse cart from localStorage', e)
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      const compactItems: StoredCartItem[] = items.map((item) => ({
        product: toSafeProductForStorage(item.product),
        quantity: item.quantity,
        additions: item.additions || '',
        additions_unit_price: Number(item.additions_unit_price) || 0,
        additions_ids: Array.isArray(item.additions_ids) ? item.additions_ids : [],
      }))
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(compactItems))
    } catch (error) {
      const isQuotaError =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.code === 22)
      if (isQuotaError) {
        // Fallback sicuro: salva solo i primi elementi compatti per evitare crash runtime.
        try {
          const fallbackItems: StoredCartItem[] = items.slice(0, 10).map((item) => ({
            product: {
              id: item.product.id,
              name: item.product.name,
              price: Number(item.product.price) || 0,
              image_url: null,
            },
            quantity: item.quantity,
            additions: '',
            additions_unit_price: Number(item.additions_unit_price) || 0,
            additions_ids: Array.isArray(item.additions_ids) ? item.additions_ids : [],
          }))
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(fallbackItems))
        } catch {
          // Ignore: manteniamo il carrello in memoria, ma evitiamo di rompere il rendering.
        }
      } else {
        console.error('Failed to persist cart', error)
      }
    }
  }, [items])

  const addItem = (product: Product, options?: string | AddItemOptions) => {
    const additionsText =
      typeof options === 'string' ? options : (options?.additions ?? '')
    const rawAdditionsUnitPrice =
      typeof options === 'string' ? 0 : Number(options?.additionsUnitPrice ?? 0)
    const normalizedAdditions = additionsText.slice(0, 160)
    const normalizedAdditionsUnitPrice =
      Number.isFinite(rawAdditionsUnitPrice) && rawAdditionsUnitPrice > 0
        ? Math.round(rawAdditionsUnitPrice * 100) / 100
        : 0
    const normalizedAdditionsIds =
      typeof options === 'string'
        ? []
        : Array.isArray(options?.additionsIds)
          ? options.additionsIds.filter((id): id is string => typeof id === 'string')
          : []

    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.product.id === product.id)
      if (existingItem) {
        return prevItems.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                additions: normalizedAdditions.trim() ? normalizedAdditions : item.additions || '',
                additions_unit_price:
                  normalizedAdditionsUnitPrice > 0
                    ? normalizedAdditionsUnitPrice
                    : item.additions_unit_price || 0,
                additions_ids:
                  normalizedAdditionsIds.length > 0
                    ? normalizedAdditionsIds
                    : item.additions_ids || [],
              }
            : item
        )
      }
      return [
        ...prevItems,
        {
          product,
          quantity: 1,
          additions: normalizedAdditions,
          additions_unit_price: normalizedAdditionsUnitPrice,
          additions_ids: normalizedAdditionsIds,
        },
      ]
    })
  }

  const removeItem = (productId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.product.id !== productId))
  }

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId)
      return
    }
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    )
  }

  const clearCart = () => {
    setItems([])
  }

  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const subtotal = items.reduce(
    (sum, item) =>
      sum + (item.product.price + (item.additions_unit_price || 0)) * item.quantity,
    0
  )

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
