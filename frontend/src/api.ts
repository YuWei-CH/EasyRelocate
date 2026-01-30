import { apiUrl } from './config'

export type Listing = {
  id: string
  source: string
  source_url: string
  title: string | null
  price_value: number | null
  currency: string
  price_period: string
  lat: number | null
  lng: number | null
  location_text: string | null
  captured_at: string
}

export type Target = {
  id: string
  name: string
  address: string | null
  lat: number
  lng: number
  updated_at: string
}

export type CompareItem = {
  listing: Listing
  metrics: { distance_km: number | null }
}

export type CompareResponse = {
  target: Target
  items: CompareItem[]
}

export type ListingSummary = {
  count: number
  latest_id: string | null
  latest_captured_at: string | null
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
    )
  }
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function deleteListing(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/listings/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
  await parseJsonOrThrow(res)
}

export async function fetchListingsSummary(): Promise<ListingSummary> {
  const res = await fetch(apiUrl('/api/listings/summary'), { method: 'GET' })
  return (await parseJsonOrThrow(res)) as ListingSummary
}

export async function upsertTarget(payload: {
  id?: string
  name: string
  address?: string
  lat?: number
  lng?: number
}): Promise<Target> {
  const res = await fetch(apiUrl('/api/targets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(res)) as Target
}

export async function fetchCompare(targetId?: string): Promise<CompareResponse> {
  const url = new URL(apiUrl('/api/compare'))
  if (targetId) url.searchParams.set('target_id', targetId)
  const res = await fetch(url.toString(), { method: 'GET' })
  return (await parseJsonOrThrow(res)) as CompareResponse
}

export type GeocodeResult = {
  display_name: string
  lat: number
  lng: number
}

export async function geocodeAddress(
  query: string,
  opts?: { limit?: number },
): Promise<GeocodeResult[]> {
  const url = new URL(apiUrl('/api/geocode'))
  url.searchParams.set('query', query)
  if (opts?.limit != null) url.searchParams.set('limit', String(opts.limit))
  const res = await fetch(url.toString(), { method: 'GET' })
  return (await parseJsonOrThrow(res)) as GeocodeResult[]
}

export type ReverseGeocodeResponse = {
  display_name: string | null
  rough_location: string | null
  approx_street: string | null
}

export async function reverseGeocode(opts: {
  lat: number
  lng: number
  zoom?: number
}): Promise<ReverseGeocodeResponse> {
  const url = new URL(apiUrl('/api/reverse_geocode'))
  url.searchParams.set('lat', String(opts.lat))
  url.searchParams.set('lng', String(opts.lng))
  if (opts.zoom != null) url.searchParams.set('zoom', String(opts.zoom))
  const res = await fetch(url.toString(), { method: 'GET' })
  return (await parseJsonOrThrow(res)) as ReverseGeocodeResponse
}
