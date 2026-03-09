import type { Product, UpsellProductOverride, UpsellProductOverrides } from './supabase'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function normalizeUpsellProductOverrides(value: unknown): UpsellProductOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const record = value as Record<string, unknown>
  const normalized: UpsellProductOverrides = {}

  for (const [productId, rawOverride] of Object.entries(record)) {
    if (!productId || typeof rawOverride !== 'object' || rawOverride === null || Array.isArray(rawOverride)) {
      continue
    }

    const source = rawOverride as Record<string, unknown>
    const next: UpsellProductOverride = {}

    if (typeof source.name === 'string') {
      const cleanName = source.name.trim()
      if (cleanName) next.name = cleanName
    }

    const parsedPrice = toNumber(source.price)
    if (parsedPrice !== null && parsedPrice >= 0) {
      next.price = Math.round(parsedPrice * 100) / 100
    }

    if (typeof source.available === 'boolean') {
      next.available = source.available
    }

    if (Object.keys(next).length > 0) {
      normalized[productId] = next
    }
  }

  return normalized
}

export function applyUpsellOverrideToProduct(product: Product, overrides: UpsellProductOverrides): Product {
  const override = overrides[product.id]
  if (!override) return product

  return {
    ...product,
    name: typeof override.name === 'string' && override.name.trim() ? override.name.trim() : product.name,
    price: typeof override.price === 'number' && Number.isFinite(override.price) ? override.price : product.price,
    available: typeof override.available === 'boolean' ? override.available : product.available,
  }
}

export function buildUpsellProductOverride(
  baseProduct: Product,
  values: { name: string; price: number; available: boolean }
): UpsellProductOverride | null {
  const cleanName = values.name.trim()
  const normalizedPrice = Math.round(values.price * 100) / 100
  const basePrice = Math.round(Number(baseProduct.price) * 100) / 100

  const next: UpsellProductOverride = {}

  if (cleanName && cleanName !== baseProduct.name) {
    next.name = cleanName
  }

  if (Number.isFinite(normalizedPrice) && normalizedPrice >= 0 && normalizedPrice !== basePrice) {
    next.price = normalizedPrice
  }

  if (values.available !== Boolean(baseProduct.available)) {
    next.available = values.available
  }

  return Object.keys(next).length > 0 ? next : null
}
