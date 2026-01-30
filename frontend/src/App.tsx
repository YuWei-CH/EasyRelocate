import './App.css'
import { useCallback, useEffect, useMemo, useState } from 'react'

import MapView from './MapView'
import type { CompareItem } from './api'
import { deleteListing, fetchCompare, reverseGeocode, upsertTarget } from './api'

type SortKey = 'distance' | 'price'

function isWithinUsBounds(lat: number, lng: number): boolean {
  return lat >= 24.396308 && lat <= 49.384358 && lng >= -125.0011 && lng <= -66.93457
}

function mapStatus(item: CompareItem): { ok: boolean; label?: string } {
  const lat = item.listing.lat
  const lng = item.listing.lng
  if (lat == null || lng == null) return { ok: false, label: 'No coords' }
  if (!isWithinUsBounds(lat, lng)) return { ok: false, label: 'Outside US' }
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

function App() {
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

  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [maxDistanceKm, setMaxDistanceKm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('distance')

  const [isPickingTarget, setIsPickingTarget] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedItem = useMemo(() => {
    if (!selectedListingId) return null
    return compareItems.find((it) => it.listing.id === selectedListingId) ?? null
  }, [compareItems, selectedListingId])

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
    async (opts?: { nextTargetId?: string | null }) => {
      const id = opts?.nextTargetId ?? targetId
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetchCompare(id)
        setTarget(res.target)
        setCompareItems(res.items)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [targetId],
  )

  useEffect(() => {
    if (!targetId) return
    void refresh()
  }, [refresh, targetId])

  const onSaveTarget = async () => {
    const address = targetAddress.trim()
    const lat = parseNumberOrNull(targetLat)
    const lng = parseNumberOrNull(targetLng)
    if ((lat == null) !== (lng == null)) {
      setError('Lat and Lng must be provided together.')
      return
    }
    if (!address && (lat == null || lng == null)) {
      setError('Provide a target address, or both lat/lng.')
      return
    }
    if (lat != null && lng != null && !isWithinUsBounds(lat, lng)) {
      setError('Target must be within the US for now.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload: Parameters<typeof upsertTarget>[0] = {
        id: targetId ?? undefined,
        name: targetName.trim() || 'Workplace',
      }
      if (address) payload.address = address
      if (lat != null && lng != null) {
        payload.lat = lat
        payload.lng = lng
      }

      const saved = await upsertTarget(payload)

      setTargetId(saved.id)
      setTargetName(saved.name)
      setTargetAddress(saved.address ?? '')
      setTargetLat(String(saved.lat))
      setTargetLng(String(saved.lng))
      setTarget(saved)
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
    setTargetLat(lat.toFixed(6))
    setTargetLng(lng.toFixed(6))
    try {
      const rev = await reverseGeocode({ lat, lng })
      const next = (rev.rough_location || rev.display_name || '').trim()
      if (next) setTargetAddress(next)
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
      const da = a.metrics.distance_km ?? Number.POSITIVE_INFINITY
      const db = b.metrics.distance_km ?? Number.POSITIVE_INFINITY
      return da - db
    }
    const byPrice = (a: CompareItem, b: CompareItem) => {
      const pa = a.listing.price_value ?? Number.POSITIVE_INFINITY
      const pb = b.listing.price_value ?? Number.POSITIVE_INFINITY
      return pa - pb
    }
    const sorted = [...filtered].sort(sortKey === 'price' ? byPrice : byDistance)
    return sorted
  }, [compareItems, maxDistanceKm, priceMax, priceMin, sortKey])

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

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>EasyRelocate</h1>
          <div className="hint">
            US-only MVP: save Airbnb listings via the extension, then compare here.
          </div>
        </div>
        <div className="actions">
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
                <label>Address (US)</label>
                <input
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder="e.g. 1600 Amphitheatre Pkwy, Mountain View, CA"
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Lat</label>
                <input
                  value={targetLat}
                  onChange={(e) => setTargetLat(e.target.value)}
                  placeholder="37.422"
                />
              </div>
              <div className="field">
                <label>Lng</label>
                <input
                  value={targetLng}
                  onChange={(e) => setTargetLng(e.target.value)}
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
            {error ? <div className="error">{error}</div> : null}
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
                <label>Max distance (km)</label>
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
                      <span className="badge">{it.listing.source}</span>
                      {!status.ok ? (
                        <span className="badge warn">{status.label}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="meta">
                    <div>{formatPrice(it)}</div>
                    <div>{formatDistance(it)}</div>
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
                  </div>
                  <div className="cta">
                    <a
                      className="linkButton"
                      href={it.listing.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open on Airbnb
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
            items={filteredAndSorted}
            selectedListingId={selectedListingId}
            onSelectListingId={setSelectedListingId}
            isPickingTarget={isPickingTarget}
            onPickTarget={onPickTarget}
            fitKey={fitKey}
          />
        </main>
      </div>
    </div>
  )
}

export default App
