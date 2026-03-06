export type ProductPieceOption = {
  id: string
  pieces: number
  price: number
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function normalizeProductPieceOptions(value: unknown): ProductPieceOption[] {
  if (!Array.isArray(value)) return []

  const normalized = value
    .map((entry) => {
      const raw = entry as Partial<ProductPieceOption>
      const pieces = Math.max(1, Math.min(99, Math.round(toNumber(raw.pieces, 0))))
      const price = Math.max(0, Math.round(toNumber(raw.price, 0) * 100) / 100)
      const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `pieces-${pieces}`
      if (!pieces || !Number.isFinite(price)) return null
      return { id, pieces, price }
    })
    .filter((option): option is ProductPieceOption => option !== null)
    .sort((a, b) => a.pieces - b.pieces)

  const seen = new Set<string>()
  return normalized.filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}

export function parseProductPieceOptionsInput(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return { options: [] as ProductPieceOption[], error: null as string | null }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const options: ProductPieceOption[] = []

  for (const line of lines) {
    const match = line.match(/^(\d+)\s*[:\-]\s*(\d+(?:[.,]\d{1,2})?)$/)
    if (!match) {
      return {
        options: [],
        error: 'Formato porzioni non valido. Usa una riga per opzione, ad esempio: 3:4.50',
      }
    }

    const pieces = Math.max(1, Math.min(99, Number(match[1])))
    const price = Math.round(Number(match[2].replace(',', '.')) * 100) / 100
    if (!Number.isFinite(price) || price < 0) {
      return { options: [], error: 'Prezzo porzione non valido' }
    }

    options.push({
      id: `pieces-${pieces}`,
      pieces,
      price,
    })
  }

  return { options: normalizeProductPieceOptions(options), error: null as string | null }
}

export function serializeProductPieceOptions(options: ProductPieceOption[] | null | undefined) {
  return normalizeProductPieceOptions(options)
    .map((option) => `${option.pieces}:${option.price.toFixed(2)}`)
    .join('\n')
}

export function formatProductPieceOptionLabel(option: ProductPieceOption) {
  return `${option.pieces} pezzi`
}

export function buildProductNameWithPieceOption(baseName: string, option: ProductPieceOption) {
  return `${baseName} (${formatProductPieceOptionLabel(option)})`
}
