import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/rate-limit'
import { getDeliveryPolygonFromOpeningHours, isDeliveryPolygonReady, isPointInsideDeliveryPolygon } from '@/lib/delivery-area'

const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 })
const geocodeCache = new Map<string, { lat: number; lng: number; expiresAt: number }>()
const geocodeCacheTtlMs = 6 * 60 * 60 * 1000

function getClientIp(request: Request) {
  const header = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (!header) return 'unknown'
  return header.split(',')[0]?.trim() || 'unknown'
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

function normalizeGeocodeKey(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function withCountryHint(address: string) {
  return /\bitalia\b/i.test(address) ? address : `${address}, Italia`
}

async function geocodeAddress(rawAddress: string) {
  const key = normalizeGeocodeKey(rawAddress)
  if (!key) return null

  const cached = geocodeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { lat: cached.lat, lng: cached.lng }
  }

  const query = withCountryHint(rawAddress)
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'localhost'
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'it-IT,it;q=0.9',
        'User-Agent': `AmicoFrittoDelivery/1.0 (${siteUrl})`,
      },
      cache: 'no-store',
    },
    6000
  )

  if (!response.ok) return null

  const data = (await response.json().catch(() => null)) as
    | Array<{ lat?: string | number; lon?: string | number }>
    | null
  if (!Array.isArray(data) || data.length === 0) return null

  const lat = Number(data[0]?.lat)
  const lng = Number(data[0]?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  geocodeCache.set(key, { lat, lng, expiresAt: Date.now() + geocodeCacheTtlMs })
  return { lat, lng }
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = limiter(`delivery-check:${ip}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova tra poco.' },
      { status: 429, headers: rate.headers }
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { address?: unknown }
    const address = String(body?.address || '').trim()
    if (!address) {
      return NextResponse.json({ error: 'Indirizzo mancante' }, { status: 400, headers: rate.headers })
    }

    const supabase = getSupabaseServerClient()
    const { data: storeInfo } = await supabase
      .from('store_info')
      .select('opening_hours')
      .limit(1)
      .maybeSingle()

    const polygon = getDeliveryPolygonFromOpeningHours(storeInfo?.opening_hours ?? null)
    if (!isDeliveryPolygonReady(polygon)) {
      return NextResponse.json(
        { eligible: true, mode: 'not_configured', message: null },
        { headers: rate.headers }
      )
    }

    const geocoded = await geocodeAddress(address)
    if (!geocoded) {
      return NextResponse.json(
        {
          eligible: false,
          mode: 'unverifiable',
          message: 'Impossibile verificare l indirizzo. Controlla via, civico, CAP e comune.',
        },
        { status: 200, headers: rate.headers }
      )
    }

    const inside = isPointInsideDeliveryPolygon([geocoded.lat, geocoded.lng], polygon)
    if (!inside) {
      return NextResponse.json(
        { eligible: false, mode: 'outside', message: 'Indirizzo fuori area delivery.' },
        { status: 200, headers: rate.headers }
      )
    }

    return NextResponse.json(
      { eligible: true, mode: 'inside', message: 'Consegna disponibile per questo indirizzo.' },
      { headers: rate.headers }
    )
  } catch (error) {
    console.error('[delivery-check] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Errore verifica indirizzo' },
      { status: 500, headers: rate.headers }
    )
  }
}

