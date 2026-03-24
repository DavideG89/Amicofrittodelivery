const REMOVABLE_INGREDIENT_CATEGORY_KEYWORDS = [
  'hamburger',
  'burgers',
  'burger',
  'mini',
  'panino',
  'panini',
  'kebab',
  'kebabs',
] as const

const normalizeIngredientKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const normalizeIngredientValue = (value: string) => value.trim().replace(/\s+/g, ' ')

export function parseIngredientList(value?: string | null): string[] {
  if (!value) return []

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const part of String(value).split(/[,;\n•]+/)) {
    const ingredient = normalizeIngredientValue(part)
    if (!ingredient) continue

    const key = normalizeIngredientKey(ingredient)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(ingredient)
  }

  return normalized
}

export function normalizeIngredientSelection(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : value instanceof Set
      ? Array.from(value)
      : []

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const entry of rawValues) {
    if (typeof entry !== 'string') continue
    const ingredient = normalizeIngredientValue(entry)
    if (!ingredient) continue

    const key = normalizeIngredientKey(ingredient)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(ingredient)
  }

  return normalized
}

export function resolveRemovedIngredients(selected: unknown, availableIngredients: string[]) {
  const normalizedSelected = normalizeIngredientSelection(selected)
  const availableLookup = new Map(
    availableIngredients.map((ingredient) => [normalizeIngredientKey(ingredient), ingredient] as const)
  )
  const selectedKeys = new Set(normalizedSelected.map((ingredient) => normalizeIngredientKey(ingredient)))

  const removedIngredients = availableIngredients.filter((ingredient) =>
    selectedKeys.has(normalizeIngredientKey(ingredient))
  )
  const invalidIngredients = normalizedSelected.filter(
    (ingredient) => !availableLookup.has(normalizeIngredientKey(ingredient))
  )

  return {
    removedIngredients,
    invalidIngredients,
  }
}

export function isIngredientRemovalEnabledForCategory(categorySlug?: string | null, categoryName?: string | null) {
  const text = `${categorySlug || ''} ${categoryName || ''}`.toLowerCase()
  return REMOVABLE_INGREDIENT_CATEGORY_KEYWORDS.some((keyword) => text.includes(keyword))
}

export function formatRemovedIngredientsLabel(removedIngredients: string[]) {
  return removedIngredients.length > 0 ? `Senza: ${removedIngredients.join(', ')}` : ''
}
