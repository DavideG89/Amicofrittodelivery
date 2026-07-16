export const ORDER_PUBLIC_TOKEN_MIN_LENGTH = 32
export const ORDER_PUBLIC_TOKEN_MAX_LENGTH = 128

export function normalizeOrderPublicToken(value: unknown) {
  if (typeof value !== 'string') return ''
  const token = value.trim()
  if (token.length < ORDER_PUBLIC_TOKEN_MIN_LENGTH || token.length > ORDER_PUBLIC_TOKEN_MAX_LENGTH) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return ''
  return token
}

export function buildOrderTrackingPath(orderNumber: string, publicToken?: string | null) {
  const path = `/order/${encodeURIComponent(orderNumber)}`
  const token = normalizeOrderPublicToken(publicToken)
  if (!token) return path
  return `${path}?token=${encodeURIComponent(token)}`
}
