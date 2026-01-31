import '../App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import MapView from '../MapView'
import type { CompareItem, ListingSummary } from '../api'
import { DISABLE_GOOGLE_MAPS } from '../config'
import { loadGoogleMaps } from '../googleMaps'
import {
  deleteListing,
  fetchCompare,
  fetchListingsSummary,
  reverseGeocode,
  upsertTarget,
} from '../api'

type SortKey = 'distance' | 'price'
type TargetLocationMode = 'address' | 'coords'
type RouteMode = 'LINE' | 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING'
type TravelMode = Exclude<RouteMode, 'LINE'>
type RouteSummary = {
  mode: TravelMode
  distanceText: string
  durationText: string
}

type RouteMetric = {
  distance_m: number
  duration_s: number
  distanceText: string
  durationText: string
}

function mapStatus(item: CompareItem): { ok: boolean; label?: string } {
  const lat = item.listing.lat
  const lng = item.listing.lng
  if (lat == null || lng == null) return { ok: false, label: 'No coords' }
  return { ok: true }
}

function formatPrice(item: CompareItem): string {
  const v = item.listing.price_value
  if (v == null) return 'Price: —'
  const currency = item.listing.currency || 'USD'
  const period = item.listing.price_period || 'unknown'
  return `Price: ${currency} ${v.toLocaleString()} / ${period}`
}

function formatDistance(item: CompareItem): string {
  const km = item.metrics.distance_km
  if (km == null) return 'Distance: —'
  const rounded = Math.round(km * 10) / 10
  return `Distance: ${rounded} km`
}

function parseNumberOrNull(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function modeLabel(mode: RouteMode): string {
  if (mode === 'LINE') return 'Line'
  if (mode === 'DRIVING') return 'Drive'
  if (mode === 'TRANSIT') return 'Bus'
  if (mode === 'WALKING') return 'Walk'
  return 'Bike'
}

function sourceLabel(source: string): string {
  const s = source.trim().toLowerCase()
  if (s === 'airbnb') return 'Airbnb'
  if (s === 'blueground') return 'Blueground'
  if (s === 'post') return 'Post'
  return source
}

function App() {
  const [workspaceToken, setWorkspaceToken] = useState(
    localStorage.getItem('easyrelocate_workspace_token') ?? '',
  )
  const [workspaceNote, setWorkspaceNote] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(
    localStorage.getItem('easyrelocate_target_id'),
  )
  const [targetName, setTargetName] = useState(
    localStorage.getItem('easyrelocate_target_name') ?? 'Workplace',
  )
  const [targetAddress, setTargetAddress] = useState(
    localStorage.getItem('easyrelocate_target_address') ?? '',
  )
  const [targetLat, setTargetLat] = useState(
    localStorage.getItem('easyrelocate_target_lat') ?? '',
  )
  const [targetLng, setTargetLng] = useState(
    localStorage.getItem('easyrelocate_target_lng') ?? '',
  )
  const [targetLocationMode, setTargetLocationMode] = useState<TargetLocationMode>(() => {
    const raw = localStorage.getItem('easyrelocate_target_location_mode')
    return raw === 'coords' || raw === 'address' ? raw : 'address'
  })
  const [targetCoordsPreviewLocation, setTargetCoordsPreviewLocation] = useState<string | null>(
    null,
  )

  const [compareItems, setCompareItems] = useState<CompareItem[]>([])
  const [target, setTarget] = useState<{
    id: string
    name: string
    address: string | null
    lat: number
    lng: number
    updated_at: string
  } | null>(null)
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [selectedListingApprox, setSelectedListingApprox] = useState<{
    approx_street: string | null
    rough_location: string | null
    display_name: string | null
  } | null>(null)
  const [routeMode, setRouteMode] = useState<RouteMode>('LINE')
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const [routeMetricsById, setRouteMetricsById] = useState<
    Record<string, RouteMetric | null>
  >({})
  const routeMetricsCacheRef = useRef<Record<string, Record<string, RouteMetric | null>>>({})
  const routeMetricsRequestIdRef = useRef(0)

  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [maxDistanceKm, setMaxDistanceKm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('distance')

  const [isPickingTarget, setIsPickingTarget] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastListingSummaryRef = useRef<ListingSummary | null>(null)
  const isAutoRefreshingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem('easyrelocate_target_location_mode', targetLocationMode)
  }, [targetLocationMode])

  useEffect(() => {
    if (targetLocationMode !== 'coords') setIsPickingTarget(false)
  }, [targetLocationMode])

  const selectedItem = useMemo(() => {
    if (!selectedListingId) return null
    return compareItems.find((it) => it.listing.id === selectedListingId) ?? null
  }, [compareItems, selectedListingId])

  useEffect(() => {
    setRouteSummary(null)
    setRouteError(null)
  }, [routeMode, selectedListingId])

  useEffect(() => {
    routeMetricsCacheRef.current = {}
    setRouteMetricsById({})
  }, [target?.id, target?.updated_at])

  useEffect(() => {
    if (!target || routeMode === 'LINE') {
      setRouteMetricsById({})
      return
    }
    const key = `${target.id}:${target.updated_at}:${routeMode}`
    setRouteMetricsById(routeMetricsCacheRef.current[key] ?? {})
  }, [routeMode, target])

  useEffect(() => {
    if (sortKey !== 'distance') return
    if (!target || routeMode === 'LINE') return
    if (DISABLE_GOOGLE_MAPS) return

    let cancelled = false
    const requestId = ++routeMetricsRequestIdRef.current
    const cacheKey = `${target.id}:${target.updated_at}:${routeMode}`
    const travelMode: TravelMode = routeMode

    const hasOwn = (obj: object, key: string): boolean =>
      Object.prototype.hasOwnProperty.call(obj, key)

    const candidates = compareItems.filter((it) => it.listing.lat != null && it.listing.lng != null)

    const routeOnce = async (
      svc: any,
      origin: { lat: number; lng: number },
      dest: { lat: number; lng: number },
      mode: TravelMode,
    ): Promise<RouteMetric | null> => {
      return await new Promise((resolve) => {
        svc.route(
          {
            origin,
            destination: dest,
            travelMode: mode,
          },
          (result: any, status: any) => {
            if (status !== 'OK' || !result) {
              resolve(null)
              return
            }
            const leg = result.routes?.[0]?.legs?.[0]
            const distanceText = leg?.distance?.text
            const durationText = leg?.duration?.text
            const distanceValue = leg?.distance?.value
            const durationValue = leg?.duration?.value
            if (
              typeof distanceText === 'string' &&
              typeof durationText === 'string' &&
              typeof distanceValue === 'number' &&
              typeof durationValue === 'number'
            ) {
              resolve({
                distance_m: distanceValue,
                duration_s: durationValue,
                distanceText,
                durationText,
              })
              return
            }
            resolve(null)
          },
        )
      })
    }

    void (async () => {
      try {
        await loadGoogleMaps()
      } catch {
        return
      }
      if (cancelled) return
      if (routeMetricsRequestIdRef.current !== requestId) return

      const svc = new google.maps.DirectionsService()
      const origin = { lat: target.lat, lng: target.lng }
      const mode = travelMode

      for (const it of candidates) {
        if (cancelled) return
        if (routeMetricsRequestIdRef.current !== requestId) return

        const id = it.listing.id
        const existing = routeMetricsCacheRef.current[cacheKey] ?? {}
        if (hasOwn(existing, id)) continue

        const metric = await routeOnce(
          svc,
          origin,
          { lat: it.listing.lat!, lng: it.listing.lng! },
          mode,
        )
        if (cancelled) return
        if (routeMetricsRequestIdRef.current !== requestId) return

        const next = { ...(routeMetricsCacheRef.current[cacheKey] ?? {}), [id]: metric }
        routeMetricsCacheRef.current[cacheKey] = next
        setRouteMetricsById(next)

        await new Promise((r) => setTimeout(r, 90))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [compareItems, routeMode, sortKey, target])

  useEffect(() => {
    if (!selectedItem) {
      setSelectedListingApprox(null)
      return
    }
    const lat = selectedItem.listing.lat
    const lng = selectedItem.listing.lng
    if (lat == null || lng == null) {
      setSelectedListingApprox(null)
      return
    }
    void (async () => {
      try {
        const res = await reverseGeocode({
          lat,
          lng,
          zoom: 18,
        })
        setSelectedListingApprox(res)
      } catch {
        setSelectedListingApprox(null)
      }
    })()
  }, [selectedItem])

  const refresh = useCallback(
    async (opts?: { nextTargetId?: string | null; silent?: boolean }) => {
      const id = opts?.nextTargetId ?? targetId
      if (!id) return
      const silent = opts?.silent ?? false
      const token = (localStorage.getItem('easyrelocate_workspace_token') ?? '').trim()
      if (!token) {
        if (!silent) setError('Missing workspace token. Use Help to get one.')
        return
      }
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetchCompare(id)
        setTarget(res.target)
        setCompareItems(res.items)
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [targetId],
  )

  const saveWorkspaceToken = useCallback(async () => {
    const t = workspaceToken.trim()
    if (!t) {
      localStorage.removeItem('easyrelocate_workspace_token')
      setError('Workspace token cleared. Paste a workspace token to use the app.')
      setWorkspaceNote('Cleared.')
      return
    }
    localStorage.setItem('easyrelocate_workspace_token', t)
    setError(null)
    setWorkspaceNote('Saved.')
    if (targetId) await refresh({ nextTargetId: targetId })
  }, [refresh, targetId, workspaceToken])

  useEffect(() => {
    if (!targetId) return
    void refresh()
  }, [refresh, targetId])

  useEffect(() => {
    if (!targetId) return
    let cancelled = false

    const checkForNewListings = async (opts?: { force?: boolean }) => {
      if (cancelled) return
      if (!opts?.force && document.hidden) return
      const token = (localStorage.getItem('easyrelocate_workspace_token') ?? '').trim()
      if (!token) return
      try {
        const summary = await fetchListingsSummary()
        if (cancelled) return

        const prev = lastListingSummaryRef.current
        lastListingSummaryRef.current = summary
        const changed =
          prev != null &&
          (prev.count !== summary.count ||
            prev.latest_id !== summary.latest_id ||
            prev.latest_captured_at !== summary.latest_captured_at)

        if (changed && !isAutoRefreshingRef.current) {
          isAutoRefreshingRef.current = true
          try {
            await refresh({ nextTargetId: targetId, silent: true })
          } finally {
            isAutoRefreshingRef.current = false
          }
        }
      } catch {
        // ignore (offline / backend down)
      }
    }

    void checkForNewListings({ force: true })

    const interval = window.setInterval(() => {
      void checkForNewListings()
    }, 7000)

    const onVisibilityChange = () => {
      if (!document.hidden) void checkForNewListings({ force: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh, targetId])

  const onSaveTarget = async () => {
    const token = (localStorage.getItem('easyrelocate_workspace_token') ?? '').trim()
    if (!token) {
      setError('Missing workspace token. Set a workspace token first.')
      return
    }
    const address = targetAddress.trim()
    const lat = parseNumberOrNull(targetLat)
    const lng = parseNumberOrNull(targetLng)
    if (targetLocationMode === 'address') {
      if (!address) {
        setError('Provide a target address.')
        return
      }
    } else {
      if (lat == null || lng == null) {
        setError('Provide both Lat and Lng (or pick on map).')
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const payload: Parameters<typeof upsertTarget>[0] = {
        id: targetId ?? undefined,
        name: targetName.trim() || 'Workplace',
      }
      if (targetLocationMode === 'address') payload.address = address
      if (targetLocationMode === 'coords') {
        payload.lat = lat as number
        payload.lng = lng as number
      }

      const saved = await upsertTarget(payload)

      setTargetId(saved.id)
      setTargetName(saved.name)
      setTargetAddress(saved.address ?? '')
      setTargetLat(String(saved.lat))
      setTargetLng(String(saved.lng))
      setTarget(saved)
      setTargetCoordsPreviewLocation(null)
      localStorage.setItem('easyrelocate_target_id', saved.id)
      localStorage.setItem('easyrelocate_target_name', saved.name)
      localStorage.setItem('easyrelocate_target_address', saved.address ?? '')
      localStorage.setItem('easyrelocate_target_lat', String(saved.lat))
      localStorage.setItem('easyrelocate_target_lng', String(saved.lng))

      await refresh({ nextTargetId: saved.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const onRemoveSelected = async () => {
    if (!selectedListingId) return
    const label =
      selectedItem?.listing.title?.trim() ||
      selectedItem?.listing.location_text?.trim() ||
      selectedItem?.listing.source_url ||
      'this listing'

    if (!window.confirm(`Remove "${label}" from EasyRelocate?`)) return

    setLoading(true)
    setError(null)
    try {
      await deleteListing(selectedListingId)
      setCompareItems((items) =>
        items.filter((it) => it.listing.id !== selectedListingId),
      )
      setSelectedListingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const onPickTarget = async (lat: number, lng: number) => {
    setIsPickingTarget(false)
    setTargetLocationMode('coords')
    setTargetLat(lat.toFixed(6))
    setTargetLng(lng.toFixed(6))
    setTargetCoordsPreviewLocation(null)
    try {
      const rev = await reverseGeocode({ lat, lng })
      const next = (rev.rough_location || rev.display_name || '').trim()
      if (next) setTargetCoordsPreviewLocation(next)
    } catch {
      // ignore (network/geocoding may be disabled)
    }
  }

  const filteredAndSorted = useMemo(() => {
    const min = parseNumberOrNull(priceMin)
    const max = parseNumberOrNull(priceMax)
    const maxKm = parseNumberOrNull(maxDistanceKm)

    const filtered = compareItems.filter((it) => {
      if (min != null || max != null) {
        if (it.listing.price_value == null) return false
        if (min != null && it.listing.price_value < min) return false
        if (max != null && it.listing.price_value > max) return false
      }

      if (maxKm != null) {
        if (it.metrics.distance_km == null) return false
        if (it.metrics.distance_km > maxKm) return false
      }

      return true
    })

    const byDistance = (a: CompareItem, b: CompareItem) => {
      if (routeMode === 'LINE') {
        const da = a.metrics.distance_km ?? Number.POSITIVE_INFINITY
        const db = b.metrics.distance_km ?? Number.POSITIVE_INFINITY
        return da - db
      }
      const ra = routeMetricsById[a.listing.id]
      const rb = routeMetricsById[b.listing.id]
      const da = ra?.duration_s ?? Number.POSITIVE_INFINITY
      const db = rb?.duration_s ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db

      const la = a.metrics.distance_km ?? Number.POSITIVE_INFINITY
      const lb = b.metrics.distance_km ?? Number.POSITIVE_INFINITY
      return la - lb
    }
    const byPrice = (a: CompareItem, b: CompareItem) => {
      const pa = a.listing.price_value ?? Number.POSITIVE_INFINITY
      const pb = b.listing.price_value ?? Number.POSITIVE_INFINITY
      return pa - pb
    }
    const sorted = [...filtered].sort(sortKey === 'price' ? byPrice : byDistance)
    return sorted
  }, [compareItems, maxDistanceKm, priceMax, priceMin, routeMetricsById, routeMode, sortKey])

  const mapStats = useMemo(() => {
    let mappable = 0
    let unmappable = 0
    for (const it of filteredAndSorted) {
      if (mapStatus(it).ok) mappable += 1
      else unmappable += 1
    }
    return { mappable, unmappable, total: filteredAndSorted.length }
  }, [filteredAndSorted])

  const fitKey = target ? `${target.id}:${target.updated_at}` : 'no-target'
  const initialCenter = useMemo(() => {
    if (target) return { lat: target.lat, lng: target.lng }
    const lat = parseNumberOrNull(targetLat)
    const lng = parseNumberOrNull(targetLng)
    if (lat == null || lng == null) return null
    return { lat, lng }
  }, [target, targetLat, targetLng])

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>
            <Link className="brandLink" to="/">
              <img
                className="brandLogo"
                src="/easyrelocate-logo.svg"
                alt=""
                aria-hidden="true"
              />
              EasyRelocate
            </Link>
          </h1>
          <div className="hint">
            Save listings via the extension, then compare here.
          </div>
        </div>
        <div className="actions">
          <Link className="button secondary" to="/onboarding/extension">
            Help
          </Link>
          <a
            className="button secondary"
            href="https://github.com/YuWei-CH/EasyRelocate/issues"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Issues
          </a>
          <button
            className="button secondary"
            onClick={() => void refresh()}
            disabled={loading || !targetId}
            title={!targetId ? 'Set a target first' : 'Refresh compare'}
          >
            Refresh
          </button>
          <button
            className="button danger"
            onClick={() => void onRemoveSelected()}
            disabled={loading || !selectedListingId}
            title={!selectedListingId ? 'Select a listing first' : 'Remove selected'}
          >
            Remove
          </button>
        </div>
      </header>

      <div className="content">
        <aside className="sidebar">
          <section className="panel">
            <h2>Workspace</h2>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Workspace token</label>
                <input
                  value={workspaceToken}
                  onChange={(e) => setWorkspaceToken(e.target.value)}
                  placeholder="er_ws_..."
                />
                {!workspaceToken.trim() ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                    Need a token?{' '}
                    <Link to="/onboarding/token" style={{ color: '#2563eb' }}>
                      Get one
                    </Link>
                    .
                  </div>
                ) : null}
              </div>
              <button className="button secondary" onClick={() => void saveWorkspaceToken()}>
                Save
              </button>
            </div>
            {workspaceNote ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                {workspaceNote}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <h2>Target (Workplace)</h2>
            <div className="row">
              <div className="field" style={{ flex: 2 }}>
                <label>Name</label>
                <input
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="e.g. Google MTV"
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field" style={{ flex: 2 }}>
                <label>Location input</label>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="targetLocationMode"
                      checked={targetLocationMode === 'address'}
                      onChange={() => {
                        setTargetLocationMode('address')
                        setError(null)
                      }}
                    />
                    Address
                  </label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="targetLocationMode"
                      checked={targetLocationMode === 'coords'}
                      onChange={() => {
                        setTargetLocationMode('coords')
                        setError(null)
                      }}
                    />
                    Lat/Lng
                  </label>
                </div>
              </div>
            </div>
            {targetLocationMode === 'address' ? (
              <>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Address</label>
                    <input
                      value={targetAddress}
                      onChange={(e) => setTargetAddress(e.target.value)}
                      placeholder="e.g. 1600 Amphitheatre Pkwy, Mountain View, CA"
                    />
                  </div>
                </div>
                {target ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label>Resolved Lat</label>
                      <input value={target.lat.toFixed(6)} disabled />
                    </div>
                    <div className="field">
                      <label>Resolved Lng</label>
                      <input value={target.lng.toFixed(6)} disabled />
                    </div>
                  </div>
                ) : null}
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="actions">
                    <button
                      className="button"
                      onClick={() => void onSaveTarget()}
                      disabled={loading}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Lat</label>
                    <input
                      value={targetLat}
                      onChange={(e) => {
                        setTargetLat(e.target.value)
                        setTargetCoordsPreviewLocation(null)
                      }}
                      placeholder="37.422"
                    />
                  </div>
                  <div className="field">
                    <label>Lng</label>
                    <input
                      value={targetLng}
                      onChange={(e) => {
                        setTargetLng(e.target.value)
                        setTargetCoordsPreviewLocation(null)
                      }}
                      placeholder="-122.084"
                    />
                  </div>
                  <div className="actions">
                    <button
                      className="button secondary"
                      onClick={() => setIsPickingTarget((v) => !v)}
                      disabled={loading}
                      title="Pick target by clicking the map"
                    >
                      {isPickingTarget ? 'Click map…' : 'Pick on map'}
                    </button>
                    <button
                      className="button"
                      onClick={() => void onSaveTarget()}
                      disabled={loading}
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Approx location (from coords)</label>
                    <input
                      value={targetCoordsPreviewLocation ?? target?.address ?? ''}
                      disabled
                      placeholder="Pick on map to estimate the rough location"
                    />
                  </div>
                </div>
              </>
            )}
            {error ? <div className="error">{error}</div> : null}
          </section>

          <section className="panel">
            <h2>Routing</h2>
            <div className="row">
              <div className="actions">
                <button
                  type="button"
                  className={`button${routeMode === 'LINE' ? '' : ' secondary'}`}
                  onClick={() => setRouteMode('LINE')}
                >
                  Line
                </button>
                <button
                  type="button"
                  className={`button${routeMode === 'DRIVING' ? '' : ' secondary'}`}
                  onClick={() => setRouteMode('DRIVING')}
                >
                  Drive
                </button>
                <button
                  type="button"
                  className={`button${routeMode === 'TRANSIT' ? '' : ' secondary'}`}
                  onClick={() => setRouteMode('TRANSIT')}
                >
                  Bus
                </button>
                <button
                  type="button"
                  className={`button${routeMode === 'WALKING' ? '' : ' secondary'}`}
                  onClick={() => setRouteMode('WALKING')}
                >
                  Walk
                </button>
                <button
                  type="button"
                  className={`button${routeMode === 'BICYCLING' ? '' : ' secondary'}`}
                  onClick={() => setRouteMode('BICYCLING')}
                >
                  Bike
                </button>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
              {routeMode === 'LINE'
                ? 'Line mode uses straight-line distance. Select Drive/Bus/Walk/Bike to calculate commute.'
                : 'Select a listing to see the route (no traffic layer).'}
            </div>
            {routeMode !== 'LINE' && selectedItem && routeSummary ? (
              <div style={{ marginTop: 8, fontSize: 13, color: '#0f172a' }}>
                Commute ({modeLabel(routeSummary.mode)}): {routeSummary.durationText} (
                {routeSummary.distanceText})
              </div>
            ) : null}
            {routeMode !== 'LINE' && selectedItem && routeError ? (
              <div className="error">{routeError}</div>
            ) : null}
          </section>

          <section className="panel">
            <h2>Filters</h2>
            <div className="row">
              <div className="field">
                <label>Price min</label>
                <input
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder="e.g. 2000"
                />
              </div>
              <div className="field">
                <label>Price max</label>
                <input
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder="e.g. 4000"
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Max line distance (km)</label>
                <input
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="field">
                <label>Sort</label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="distance">Distance</option>
                  <option value="price">Price</option>
                </select>
              </div>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: '#475569',
              }}
            >
              Map markers: {mapStats.mappable}/{mapStats.total}
              {mapStats.unmappable ? ` (${mapStats.unmappable} not mappable)` : ''}
            </div>
          </section>

          <section className="list" aria-busy={loading}>
            {filteredAndSorted.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 13, padding: '4px 4px' }}>
                {targetId
                  ? 'No listings yet (or filtered out). Add some via the extension.'
                  : 'Set a target first, then add listings via the extension.'}
              </div>
            ) : null}
            {filteredAndSorted.map((it) => {
              const title =
                it.listing.title?.trim() ||
                it.listing.location_text?.trim() ||
                it.listing.source_url
              const isSelected = selectedListingId === it.listing.id
              const status = mapStatus(it)
              return (
                <div
                  key={it.listing.id}
                  className={`card${isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedListingId(it.listing.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedListingId(it.listing.id)
                    }
                  }}
                >
                  <div className="top">
                    <p className="title">{title}</p>
                    <div className="badges">
                      <span className="badge">{sourceLabel(it.listing.source)}</span>
                      {!status.ok ? (
                        <span className="badge warn">{status.label}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="meta">
                    <div>{formatPrice(it)}</div>
                    <div>{formatDistance(it)}</div>
                    {sortKey === 'distance' && routeMode !== 'LINE' ? (
                      <div>
                        Commute ({modeLabel(routeMode)}):{' '}
                        {(() => {
                          if (!status.ok) return '—'
                          const hasMetric = Object.prototype.hasOwnProperty.call(
                            routeMetricsById,
                            it.listing.id,
                          )
                          if (!hasMetric) return '…'
                          const m = routeMetricsById[it.listing.id]
                          if (!m) return '—'
                          return `${m.durationText} (${m.distanceText})`
                        })()}
                      </div>
                    ) : null}
                    {it.listing.location_text ? (
                      <div>Location: {it.listing.location_text}</div>
                    ) : null}
                    {isSelected && selectedListingApprox?.approx_street ? (
                      <div>
                        Approx street: {selectedListingApprox.approx_street}
                        <span style={{ color: '#94a3b8' }}>
                          {' '}
                          (near saved coords; approximate)
                        </span>
                      </div>
                    ) : null}
                    {isSelected && routeSummary ? (
                      <div>
                        Commute ({modeLabel(routeSummary.mode)}): {routeSummary.durationText} (
                        {routeSummary.distanceText})
                      </div>
                    ) : null}
                  </div>
                  <div className="cta">
                    <a
                      className="linkButton"
                      href={it.listing.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open on {sourceLabel(it.listing.source)}
                    </a>
                  </div>
                </div>
              )
            })}
          </section>
        </aside>

        <main className="mapWrap">
          <MapView
            target={target}
            initialCenter={initialCenter}
            items={filteredAndSorted}
            selectedListingId={selectedListingId}
            onSelectListingId={setSelectedListingId}
            isPickingTarget={isPickingTarget}
            onPickTarget={onPickTarget}
            fitKey={fitKey}
            routeMode={routeMode}
            onRouteSummary={setRouteSummary}
            onRouteError={setRouteError}
          />
        </main>
      </div>
    </div>
  )
}

export default App
