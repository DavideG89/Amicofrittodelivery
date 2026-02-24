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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('amico-fritto-cart')
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart) as CartItem[]
        if (!Array.isArray(parsed)) {
          setItems([])
          return
        }
        setItems(
          parsed
            .map((item) => {
              const normalizedQuantity = Number(item.quantity)
              const quantity =
                Number.isFinite(normalizedQuantity) && normalizedQuantity > 0
                  ? Math.floor(normalizedQuantity)
                  : 0
              return {
                ...item,
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
            .filter((item) => item.quantity > 0)
        )
      } catch (e) {
        console.error('Failed to parse cart from localStorage', e)
      }
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('amico-fritto-cart', JSON.stringify(items))
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
