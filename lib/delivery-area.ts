import type { OpeningHoursValue } from '@/lib/order-schedule'

export type DeliveryPoint = [number, number]
export type DeliveryPolygon = DeliveryPoint[]

type OpeningHoursObject = Record<string, unknown> & {
  display?: string | Record<string, string> | null
  order_schedule?: unknown
  delivery_area?: { polygon?: unknown } | null
}

export function normalizeDeliveryPolygon(points: DeliveryPolygon): DeliveryPolygon {
  return points.map(([lat, lng]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))] as DeliveryPoint)
}

export function isDeliveryPoint(value: unknown): value is DeliveryPoint {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  )
}

export function isDeliveryPolygonReady(points: DeliveryPolygon | null | undefined): points is DeliveryPolygon {
  return Array.isArray(points) && points.length >= 3
}

export function parseDeliveryPolygonInput(raw: string): { points: DeliveryPolygon | null; error: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { points: null, error: null }
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    let polygonRaw: unknown

    if (Array.isArray(parsed)) {
      polygonRaw = parsed
    } else if (parsed && typeof parsed === 'object' && 'polygon' in parsed) {
      polygonRaw = (parsed as { polygon: unknown }).polygon
    } else {
      return { points: null, error: "Formato non valido. Usa [[lat,lng], ...] oppure { \"polygon\": [[lat,lng], ...] }" }
    }

    if (!Array.isArray(polygonRaw)) {
      return { points: null, error: 'Il poligono deve essere un array di coordinate.' }
    }

    const points: DeliveryPolygon = polygonRaw.map((entry) => {
      if (!isDeliveryPoint(entry)) {
        throw new Error('Ogni vertice deve avere latitudine e longitudine numeriche.')
      }
      return [Number(entry[0]), Number(entry[1])]
    })

    return { points, error: null }
  } catch (error) {
    return { points: null, error: error instanceof Error ? error.message : 'JSON non valido.' }
  }
}

export function deliveryPolygonToJson(points: DeliveryPolygon) {
  return JSON.stringify({ polygon: normalizeDeliveryPolygon(points) }, null, 2)
}

function isPointOnSegment(point: DeliveryPoint, start: DeliveryPoint, end: DeliveryPoint, tolerance = 1e-9) {
  const [py, px] = point
  const [y1, x1] = start
  const [y2, x2] = end
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1)
  if (Math.abs(cross) > tolerance) return false

  const minX = Math.min(x1, x2) - tolerance
  const maxX = Math.max(x1, x2) + tolerance
  const minY = Math.min(y1, y2) - tolerance
  const maxY = Math.max(y1, y2) + tolerance

  return px >= minX && px <= maxX && py >= minY && py <= maxY
}

export function isPointInsideDeliveryPolygon(point: DeliveryPoint, polygon: DeliveryPolygon) {
  let inside = false
  const [py, px] = point

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]

    if (isPointOnSegment(point, polygon[i], polygon[j])) {
      return true
    }

    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }

  return inside
}

function toOpeningHoursObject(openingHours: OpeningHoursValue | null | undefined): OpeningHoursObject {
  if (openingHours && typeof openingHours === 'object' && !Array.isArray(openingHours)) {
    if ('order_schedule' in openingHours || 'delivery_area' in openingHours || 'display' in openingHours) {
      return { ...(openingHours as OpeningHoursObject) }
    }
    return { display: openingHours as Record<string, string>, order_schedule: null }
  }

  if (typeof openingHours === 'string') {
    return { display: openingHours, order_schedule: null }
  }

  return { display: null, order_schedule: null }
}

export function getDeliveryPolygonFromOpeningHours(openingHours: OpeningHoursValue | null | undefined): DeliveryPolygon | null {
  if (!openingHours || typeof openingHours !== 'object' || Array.isArray(openingHours)) return null
  if (!('delivery_area' in openingHours)) return null

  const area = (openingHours as OpeningHoursObject).delivery_area
  if (!area || typeof area !== 'object') return null
  const polygonRaw = (area as { polygon?: unknown }).polygon
  if (!Array.isArray(polygonRaw)) return null

  const points: DeliveryPolygon = []
  for (const entry of polygonRaw) {
    if (!isDeliveryPoint(entry)) return null
    points.push([Number(entry[0]), Number(entry[1])])
  }

  return points.length > 0 ? points : null
}

export function setDeliveryPolygonInOpeningHours(
  openingHours: OpeningHoursValue | null | undefined,
  polygon: DeliveryPolygon | null
): OpeningHoursValue {
  const next = toOpeningHoursObject(openingHours)
  if (isDeliveryPolygonReady(polygon)) {
    next.delivery_area = { polygon: normalizeDeliveryPolygon(polygon) }
  } else {
    delete next.delivery_area
  }
  return next as OpeningHoursValue
}

