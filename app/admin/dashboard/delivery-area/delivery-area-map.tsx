'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'

type Point = [number, number]

interface DeliveryAreaMapProps {
  points: Point[]
  onAddPoint: (point: Point) => void
}

// Amico Fritto - Corso Vittorio Emanuele, Misilmeri (PA)
const DEFAULT_CENTER: Point = [38.034291, 13.450999]

export default function DeliveryAreaMap({ points, onAddPoint }: DeliveryAreaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawLayerRef = useRef<L.LayerGroup | null>(null)
  const onAddPointRef = useRef(onAddPoint)

  useEffect(() => {
    onAddPointRef.current = onAddPoint
  }, [onAddPoint])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isSmallViewport = typeof window !== 'undefined' && window.innerWidth < 640

    // In dev (StrictMode/HMR) a stale Leaflet id may survive remounts.
    const staleContainer = container as HTMLDivElement & { _leaflet_id?: number }
    if (typeof staleContainer._leaflet_id !== 'undefined') {
      delete staleContainer._leaflet_id
    }

    const map = L.map(container, {
      center: points[0] ?? DEFAULT_CENTER,
      zoom: points.length > 0 ? (isSmallViewport ? 14 : 15) : isSmallViewport ? 13 : 14,
      zoomControl: !isSmallViewport,
      scrollWheelZoom: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const layer = L.layerGroup().addTo(map)
    drawLayerRef.current = layer
    mapRef.current = map

    const onClick = (event: L.LeafletMouseEvent) => {
      onAddPointRef.current([event.latlng.lat, event.latlng.lng])
    }
    map.on('click', onClick)

    const invalidateSize = () => map.invalidateSize({ animate: false })
    const timeoutId = window.setTimeout(invalidateSize, 0)
    const onOrientationChange = () => window.setTimeout(invalidateSize, 120)
    window.addEventListener('orientationchange', onOrientationChange)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => invalidateSize())
      resizeObserver.observe(container)
    }

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('orientationchange', onOrientationChange)
      resizeObserver?.disconnect()
      map.off('click', onClick)
      map.remove()
      mapRef.current = null
      drawLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = drawLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    if (points.length >= 2) {
      L.polyline(points, { color: '#0f766e', weight: 3 }).addTo(layer)
    }

    if (points.length >= 3) {
      L.polygon(points, { color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.18 }).addTo(layer)
    }

    points.forEach((point, index) => {
      L.circleMarker(point, { radius: 6, color: '#115e59', weight: 2 })
        .bindTooltip(`${index + 1}`, { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(layer)
    })

    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }

    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24] })
    }
  }, [points])

  return (
    <div
      ref={containerRef}
      className="h-[260px] w-full overflow-hidden rounded-lg border sm:h-[420px]"
      aria-label="Mappa area delivery"
    />
  )
}
