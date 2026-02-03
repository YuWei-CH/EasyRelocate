import { useEffect, useMemo, useRef, useState } from 'react'

import type { CompareItem, Target } from './api'
import { DISABLE_GOOGLE_MAPS } from './config'
import { loadGoogleMaps } from './googleMaps'

type RouteMode = 'LINE' | 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING'
type TravelMode = Exclude<RouteMode, 'LINE'>

type RouteSummary = {
  mode: TravelMode
  distanceText: string
  durationText: string
}

type Props = {
  target: Target | null
  initialCenter: { lat: number; lng: number } | null
  items: CompareItem[]
  selectedListingId: string | null
  onSelectListingId: (id: string) => void
  isPickingTarget: boolean
  onPickTarget: (lat: number, lng: number) => void
  fitKey: string
  routeMode: RouteMode
  onRouteSummary: (summary: RouteSummary | null) => void
  onRouteError: (message: string | null) => void
}

const WORLD_CENTER = { lng: 0, lat: 20 }

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const HOUSE_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="#2563eb" stroke="rgba(255,255,255,0.95)" stroke-width="2" />
  <path d="M5 11.2L12 5l7 6.2V19a1 1 0 0 1-1 1h-4v-6H10v6H6a1 1 0 0 1-1-1v-7.8Z" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
</svg>
`.trim()

const HOUSE_PIN_SVG_SELECTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="#2563eb" stroke="rgba(255,255,255,0.98)" stroke-width="2" />
  <circle cx="12" cy="12" r="11.2" fill="none" stroke="rgba(37,99,235,0.35)" stroke-width="2.2" />
  <path d="M5 11.2L12 5l7 6.2V19a1 1 0 0 1-1 1h-4v-6H10v6H6a1 1 0 0 1-1-1v-7.8Z" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
</svg>
`.trim()

const LAPTOP_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="#ef4444" stroke="rgba(255,255,255,0.95)" stroke-width="2" />
  <path d="M7 7h10a2 2 0 0 1 2 2v6H5V9a2 2 0 0 1 2-2Z" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
  <path d="M4 16h16v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1Z" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
</svg>
`.trim()

function markerIcon(kind: 'target' | 'listing', opts?: { selected?: boolean }) {
  const selected = opts?.selected ?? false
  if (kind === 'target') {
    return {
      url: svgUrl(LAPTOP_PIN_SVG),
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 20),
    }
  }
  const size = selected ? 34 : 30
  return {
    url: svgUrl(selected ? HOUSE_PIN_SVG_SELECTED : HOUSE_PIN_SVG),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  }
}

export default function MapView({
  target,
  initialCenter,
  items,
  selectedListingId,
  onSelectListingId,
  isPickingTarget,
  onPickTarget,
  fitKey,
  routeMode,
  onRouteSummary,
  onRouteError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const hasFitRef = useRef<string | null>(null)
  const clickListenerRef = useRef<any>(null)

  const directionsServiceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const routeRequestIdRef = useRef(0)

  const [mapLoadError, setMapLoadError] = useState<string | null>(null)

  const points = useMemo(() => {
    const listingPoints = items
      .filter((it) => it.listing.lat != null && it.listing.lng != null)
      .map((it) => ({
        id: it.listing.id,
        kind: 'listing' as const,
        lng: it.listing.lng as number,
        lat: it.listing.lat as number,
      }))
    const targetPoint =
      target == null
        ? []
        : [
            {
              id: target.id,
              kind: 'target' as const,
              lng: target.lng,
              lat: target.lat,
            },
          ]
    return [...targetPoint, ...listingPoints]
  }, [items, target])

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) return

    let cancelled = false
    void (async () => {
      try {
        if (DISABLE_GOOGLE_MAPS) {
          setMapLoadError('Google Maps is disabled (VITE_DISABLE_GOOGLE_MAPS=1).')
          return
        }
        await loadGoogleMaps()
        if (cancelled) return
        const startCenter =
          initialCenter ?? (target ? { lat: target.lat, lng: target.lng } : WORLD_CENTER)
        const map = new google.maps.Map(containerRef.current!, {
          center: startCenter,
          zoom: target || initialCenter ? 11 : 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        mapRef.current = map
        directionsServiceRef.current = new google.maps.DirectionsService()
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: '#0f172a',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          },
        })
        directionsRendererRef.current.setMap(map)
      } catch (e) {
        setMapLoadError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
      if (clickListenerRef.current) {
        clickListenerRef.current.remove()
        clickListenerRef.current = null
      }
      for (const m of markersRef.current) m.setMap(null)
      markersRef.current = []
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null)
      directionsRendererRef.current = null
      directionsServiceRef.current = null
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []

    for (const p of points) {
      const isSelected = p.kind === 'listing' && p.id === selectedListingId
      const marker = new google.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        icon: markerIcon(p.kind, { selected: isSelected }),
        clickable: p.kind === 'listing' && !isPickingTarget,
        zIndex: p.kind === 'target' ? 3 : isSelected ? 2 : 1,
      })
      if (p.kind === 'listing' && !isPickingTarget) {
        marker.addListener('click', () => onSelectListingId(p.id))
      }
      markersRef.current.push(marker)
    }

    if (points.length > 0 && hasFitRef.current !== fitKey) {
      const bounds = new google.maps.LatLngBounds()
      for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng })
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 })
      hasFitRef.current = fitKey
    }
  }, [fitKey, isPickingTarget, onSelectListingId, points, selectedListingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!target) return
    if (selectedListingId) return
    map.panTo({ lat: target.lat, lng: target.lng })
    map.setZoom(Math.max(map.getZoom() ?? 0, 12))
  }, [target, selectedListingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!selectedListingId) return
    const it = items.find((x) => x.listing.id === selectedListingId)
    if (!it) return
    if (it.listing.lat == null || it.listing.lng == null) return
    map.panTo({ lat: it.listing.lat, lng: it.listing.lng })
    map.setZoom(Math.max(map.getZoom() ?? 0, 12))
  }, [items, selectedListingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!isPickingTarget) {
      map.setOptions({ draggableCursor: undefined })
      if (clickListenerRef.current) {
        clickListenerRef.current.remove()
        clickListenerRef.current = null
      }
      return
    }

    map.setOptions({ draggableCursor: 'crosshair' })
    if (clickListenerRef.current) clickListenerRef.current.remove()
    clickListenerRef.current = map.addListener('click', (e: any) => {
      const ll = e?.latLng
      if (!ll) return
      onPickTarget(ll.lat(), ll.lng())
    })
    return () => {
      if (clickListenerRef.current) {
        clickListenerRef.current.remove()
        clickListenerRef.current = null
      }
      map.setOptions({ draggableCursor: undefined })
    }
  }, [isPickingTarget, onPickTarget])

  useEffect(() => {
    const map = mapRef.current
    const svc = directionsServiceRef.current
    const renderer = directionsRendererRef.current
    if (!map || !svc || !renderer) return

    const it =
      selectedListingId == null ? null : items.find((x) => x.listing.id === selectedListingId)
    if (
      routeMode === 'LINE' ||
      !target ||
      !it ||
      it.listing.lat == null ||
      it.listing.lng == null
    ) {
      renderer.setDirections({ routes: [] } as any)
      onRouteSummary(null)
      onRouteError(null)
      return
    }

    const requestId = ++routeRequestIdRef.current
    onRouteError(null)
    onRouteSummary(null)

    svc.route(
      {
        origin: { lat: target.lat, lng: target.lng },
        destination: { lat: it.listing.lat, lng: it.listing.lng },
        travelMode: routeMode,
      },
      (result: any, status: any) => {
        if (routeRequestIdRef.current !== requestId) return
        if (status !== 'OK' || !result) {
          renderer.setDirections({ routes: [] } as any)
          onRouteError(`Route failed: ${status}`)
          onRouteSummary(null)
          return
        }

        renderer.setDirections(result)
        const leg = result.routes?.[0]?.legs?.[0]
        const distanceText = leg?.distance?.text
        const durationText = leg?.duration?.text
        if (typeof distanceText === 'string' && typeof durationText === 'string') {
          onRouteSummary({ mode: routeMode, distanceText, durationText })
        } else {
          onRouteSummary(null)
        }

        const bounds = result.routes?.[0]?.bounds
        if (bounds) map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56 })
      },
    )
  }, [items, onRouteError, onRouteSummary, routeMode, selectedListingId, target])

  if (mapLoadError) {
    return (
      <div className="map" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ maxWidth: 520, padding: 16, color: '#0f172a' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Google Maps failed to load</div>
          <div style={{ fontSize: 13, color: '#475569' }}>{mapLoadError}</div>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="map" />
}
