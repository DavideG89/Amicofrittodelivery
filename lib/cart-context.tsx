'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Product, RemovedIngredient } from './supabase'

export type CartItem = {
  product: Product
  quantity: number
  item_source?: 'menu' | 'upsell'
  piece_option_id?: string
  additions?: string
  additions_unit_price?: number
  additions_ids?: string[]
  removed_ingredient_ids?: string[]
  removed_ingredients?: RemovedIngredient[]
  ingredient_customization_enabled?: boolean
}

type AddItemOptions = {
  product?: Product
  source?: 'menu' | 'upsell'
  pieceOptionId?: string
  additions?: string
  additionsUnitPrice?: number
  additionsIds?: string[]
  removedIngredientIds?: string[]
  removedIngredients?: RemovedIngredient[]
  ingredientCustomizationEnabled?: boolean
}

type CartContextType = {
  items: CartItem[]
  addItem: (product: Product, options?: string | AddItemOptions) => void
  removeItem: (itemKey: string) => void
  updateQuantity: (itemKey: string, quantity: number) => void
  replaceItem: (itemKey: string, options: AddItemOptions) => void
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
  item_source?: 'menu' | 'upsell'
  piece_option_id?: string
  additions?: string
  additions_unit_price?: number
  additions_ids?: string[]
  removed_ingredient_ids?: string[]
  removed_ingredients?: RemovedIngredient[]
  ingredient_customization_enabled?: boolean
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
  piece_options: null,
  available: true,
  label: null,
  display_order: 0,
  created_at: '',
  updated_at: '',
})

const normalizeIds = (ids: unknown): string[] =>
  Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort()
    : []

const normalizeRemovedIngredients = (ingredients: unknown): RemovedIngredient[] => {
  if (!Array.isArray(ingredients)) return []
  const byId = new Map<string, RemovedIngredient>()
  ingredients.forEach((ingredient) => {
    if (!ingredient || typeof ingredient !== 'object') return
    const { id, name } = ingredient as Partial<RemovedIngredient>
    if (typeof id === 'string' && id && typeof name === 'string' && name.trim()) {
      byId.set(id, { id, name: name.trim().slice(0, 120) })
    }
  })
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export const getCartItemKey = (item: Pick<CartItem, 'product' | 'item_source' | 'piece_option_id' | 'additions' | 'additions_ids' | 'removed_ingredient_ids'>) => {
  const additionsIds = Array.isArray(item.additions_ids) ? [...item.additions_ids].sort().join(',') : ''
  const removedIngredientIds = normalizeIds(item.removed_ingredient_ids).join(',')
  return [
    item.product.id,
    item.item_source || 'menu',
    item.piece_option_id || '',
    item.product.name || '',
    Number(item.product.price || 0).toFixed(2),
    item.additions || '',
    additionsIds,
    removedIngredientIds,
  ].join('::')
}

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
        item_source: item.item_source === 'upsell' ? 'upsell' : 'menu',
        piece_option_id: typeof item.piece_option_id === 'string' ? item.piece_option_id : undefined,
        additions: typeof item.additions === 'string' ? item.additions : '',
        additions_unit_price: Number.isFinite(Number(item.additions_unit_price))
          ? Number(item.additions_unit_price)
          : 0,
        additions_ids: Array.isArray(item.additions_ids)
          ? item.additions_ids.filter((id): id is string => typeof id === 'string')
          : [],
        removed_ingredient_ids: normalizeIds(item.removed_ingredient_ids),
        removed_ingredients: normalizeRemovedIngredients(item.removed_ingredients),
        ingredient_customization_enabled: item.ingredient_customization_enabled === true,
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
        item_source: item.item_source === 'upsell' ? 'upsell' : 'menu',
        piece_option_id: item.piece_option_id,
        additions: item.additions || '',
        additions_unit_price: Number(item.additions_unit_price) || 0,
        additions_ids: Array.isArray(item.additions_ids) ? item.additions_ids : [],
        removed_ingredient_ids: normalizeIds(item.removed_ingredient_ids),
        removed_ingredients: normalizeRemovedIngredients(item.removed_ingredients),
        ingredient_customization_enabled: item.ingredient_customization_enabled === true,
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
            item_source: item.item_source === 'upsell' ? 'upsell' : 'menu',
            piece_option_id: item.piece_option_id,
            additions: '',
            additions_unit_price: Number(item.additions_unit_price) || 0,
            additions_ids: Array.isArray(item.additions_ids) ? item.additions_ids : [],
            removed_ingredient_ids: normalizeIds(item.removed_ingredient_ids),
            removed_ingredients: normalizeRemovedIngredients(item.removed_ingredients),
            ingredient_customization_enabled: item.ingredient_customization_enabled === true,
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
    const source =
      typeof options === 'string'
        ? 'menu'
        : (options?.source === 'upsell' ? 'upsell' : 'menu')
    const pieceOptionId =
      typeof options === 'string' ? undefined : (typeof options?.pieceOptionId === 'string' ? options.pieceOptionId : undefined)
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
      typeof options === 'string' ? [] : normalizeIds(options?.additionsIds)
    const normalizedRemovedIngredientIds =
      typeof options === 'string' ? [] : normalizeIds(options?.removedIngredientIds)
    const normalizedRemovedIngredients =
      typeof options === 'string' ? [] : normalizeRemovedIngredients(options?.removedIngredients)
    const ingredientCustomizationEnabled =
      typeof options !== 'string' && options?.ingredientCustomizationEnabled === true

    setItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) =>
          item.product.id === product.id &&
          (item.item_source || 'menu') === source &&
          (item.piece_option_id || '') === (pieceOptionId || '') &&
          (item.additions || '') === (normalizedAdditions || '') &&
          Number(item.additions_unit_price || 0) === normalizedAdditionsUnitPrice &&
          JSON.stringify(item.additions_ids || []) === JSON.stringify(normalizedAdditionsIds)
          && JSON.stringify(normalizeIds(item.removed_ingredient_ids)) === JSON.stringify(normalizedRemovedIngredientIds)
      )
      if (existingItem) {
        return prevItems.map((item) =>
          getCartItemKey(item) === getCartItemKey(existingItem)
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
                removed_ingredient_ids: normalizedRemovedIngredientIds,
                removed_ingredients: normalizedRemovedIngredients,
                ingredient_customization_enabled:
                  item.ingredient_customization_enabled || ingredientCustomizationEnabled,
              }
            : item
        )
      }
      return [
        ...prevItems,
        {
          product,
          quantity: 1,
          item_source: source,
          piece_option_id: pieceOptionId,
          additions: normalizedAdditions,
          additions_unit_price: normalizedAdditionsUnitPrice,
          additions_ids: normalizedAdditionsIds,
          removed_ingredient_ids: normalizedRemovedIngredientIds,
          removed_ingredients: normalizedRemovedIngredients,
          ingredient_customization_enabled: ingredientCustomizationEnabled,
        },
      ]
    })
  }

  const removeItem = (itemKey: string) => {
    setItems((prevItems) => prevItems.filter((item) => getCartItemKey(item) !== itemKey))
  }

  const updateQuantity = (itemKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemKey)
      return
    }
    setItems((prevItems) =>
      prevItems.map((item) =>
        getCartItemKey(item) === itemKey ? { ...item, quantity } : item
      )
    )
  }

  const replaceItem = (itemKey: string, options: AddItemOptions) => {
    setItems((prevItems) => {
      const current = prevItems.find((item) => getCartItemKey(item) === itemKey)
      if (!current) return prevItems

      const replacement: CartItem = {
        ...current,
        product: options.product || current.product,
        piece_option_id: options.pieceOptionId ?? current.piece_option_id,
        additions: (options.additions || '').slice(0, 160),
        additions_unit_price: Math.max(0, Number(options.additionsUnitPrice) || 0),
        additions_ids: normalizeIds(options.additionsIds),
        removed_ingredient_ids: normalizeIds(options.removedIngredientIds),
        removed_ingredients: normalizeRemovedIngredients(options.removedIngredients),
      }
      const replacementKey = getCartItemKey(replacement)
      const matching = prevItems.find(
        (item) => getCartItemKey(item) !== itemKey && getCartItemKey(item) === replacementKey
      )

      if (!matching) {
        return prevItems.map((item) => getCartItemKey(item) === itemKey ? replacement : item)
      }
      return prevItems
        .filter((item) => getCartItemKey(item) !== itemKey)
        .map((item) => getCartItemKey(item) === replacementKey
          ? { ...item, quantity: item.quantity + current.quantity }
          : item)
    })
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
        replaceItem,
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
