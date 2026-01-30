import maplibregl, {
  LngLatBounds,
  Map,
  Marker,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'

import type { CompareItem, Target } from './api'

type Props = {
  target: Target | null
  items: CompareItem[]
  selectedListingId: string | null
  onSelectListingId: (id: string) => void
  isPickingTarget: boolean
  onPickTarget: (lat: number, lng: number) => void
  fitKey: string
}

const US_BOUNDS: [[number, number], [number, number]] = [
  [-125.0011, 24.396308],
  [-66.93457, 49.384358],
]

const US_CENTER: [number, number] = [-98.5795, 39.8283]

const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const HOUSE_ICON_SVG = `
<svg class="markerIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path
    d="M3 11.2L12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-8.8Z"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  />
</svg>
`.trim()

const LAPTOP_ICON_SVG = `
<svg class="markerIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path
    d="M6 5h12a2 2 0 0 1 2 2v8H4V7a2 2 0 0 1 2-2Z"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  />
  <path
    d="M2 17h20v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1Z"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  />
</svg>
`.trim()

function isWithinUsBounds(lat: number, lng: number): boolean {
  return (
    lat >= US_BOUNDS[0][1] &&
    lat <= US_BOUNDS[1][1] &&
    lng >= US_BOUNDS[0][0] &&
    lng <= US_BOUNDS[1][0]
  )
}

export default function MapView({
  target,
  items,
  selectedListingId,
  onSelectListingId,
  isPickingTarget,
  onPickTarget,
  fitKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const hasFitRef = useRef<string | null>(null)

  const points = useMemo(() => {
    const listingPoints = items
      .filter((it) => it.listing.lat != null && it.listing.lng != null)
      .filter((it) =>
        isWithinUsBounds(it.listing.lat as number, it.listing.lng as number),
      )
      .map((it) => ({
        id: it.listing.id,
        kind: 'listing' as const,
        lng: it.listing.lng as number,
        lat: it.listing.lat as number,
      }))
    const targetPoint =
      target == null
        ? []
        : isWithinUsBounds(target.lat, target.lng)
          ? [
            {
              id: target.id,
              kind: 'target' as const,
              lng: target.lng,
              lat: target.lat,
            },
          ]
          : []
    return [...targetPoint, ...listingPoints]
  }, [items, target])

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) return

    const startCenter: [number, number] =
      target != null ? [target.lng, target.lat] : US_CENTER

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: startCenter,
      zoom: target != null ? 11 : 3.5,
      maxBounds: US_BOUNDS,
      renderWorldCopies: false,
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // clear old markers
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    // create markers
    for (const p of points) {
      const el = document.createElement('div')
      const isSelected = p.kind === 'listing' && p.id === selectedListingId
      el.className = `marker ${p.kind}${isSelected ? ' selected' : ''}`
      el.innerHTML = p.kind === 'target' ? LAPTOP_ICON_SVG : HOUSE_ICON_SVG
      el.style.cursor = p.kind === 'listing' && !isPickingTarget ? 'pointer' : 'default'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map)

      if (p.kind === 'listing' && !isPickingTarget) {
        el.addEventListener('click', () => onSelectListingId(p.id))
      }

      markersRef.current.push(marker)
    }

    // fit bounds once per fitKey
    if (points.length > 0 && hasFitRef.current !== fitKey) {
      const first = points[0]
      const bounds = new LngLatBounds(
        [first.lng, first.lat],
        [first.lng, first.lat],
      )
      for (const p of points.slice(1)) bounds.extend([p.lng, p.lat])
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 450 })
      hasFitRef.current = fitKey
    }
  }, [fitKey, isPickingTarget, onSelectListingId, points, selectedListingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!selectedListingId) return
    const it = items.find((x) => x.listing.id === selectedListingId)
    if (!it) return
    if (it.listing.lat == null || it.listing.lng == null) return
    map.flyTo({
      center: [it.listing.lng, it.listing.lat],
      zoom: Math.max(map.getZoom(), 12),
      duration: 450,
    })
  }, [items, selectedListingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!isPickingTarget) {
      map.getCanvas().style.cursor = ''
      return
    }

    map.getCanvas().style.cursor = 'crosshair'
    const handler = (e: MapMouseEvent) => {
      onPickTarget(e.lngLat.lat, e.lngLat.lng)
    }
    map.once('click', handler)
    return () => {
      map.off('click', handler)
      map.getCanvas().style.cursor = ''
    }
  }, [isPickingTarget, onPickTarget])

  return <div ref={containerRef} className="map" />
}
