import { API_BASE_URL, apiUrl } from './config'

function getWorkspaceToken(): string | null {
  try {
    const raw = localStorage.getItem('easyrelocate_workspace_token')
    const t = (raw ?? '').trim()
    return t ? t : null
  } catch {
    return null
  }
}

function authHeaders(): Record<string, string> {
  const token = getWorkspaceToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 15000,
): Promise<Response> {
  const controller = new AbortController()
  const existing = init?.signal

  const onAbort = () => controller.abort()
  if (existing) {
    if (existing.aborted) controller.abort()
    else existing.addEventListener('abort', onAbort, { once: true })
  }

  const id = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (e) {
    const name = (e as any)?.name
    if (name === 'AbortError') {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          `Check that the backend is running and VITE_API_BASE_URL is correct (currently: ${API_BASE_URL || '(empty)'}).`,
      )
    }
    throw e
  } finally {
    window.clearTimeout(id)
    if (existing) existing.removeEventListener('abort', onAbort)
  }
}

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

export type InterestingTarget = {
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

export type WorkspaceIssue = {
  workspace_id: string
  workspace_token: string
  expires_at: string
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

export async function issueWorkspaceToken(): Promise<WorkspaceIssue> {
  const res = await fetchWithTimeout(apiUrl('/api/workspaces/issue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return (await parseJsonOrThrow(res)) as WorkspaceIssue
}

export async function deleteListing(id: string): Promise<void> {
  const res = await fetchWithTimeout(apiUrl(`/api/listings/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  await parseJsonOrThrow(res)
}

export async function fetchListingsSummary(): Promise<ListingSummary> {
  const res = await fetchWithTimeout(apiUrl('/api/listings/summary'), {
    method: 'GET',
    headers: authHeaders(),
  })
  return (await parseJsonOrThrow(res)) as ListingSummary
}

export async function upsertTarget(payload: {
  id?: string
  name: string
  address?: string
  lat?: number
  lng?: number
}): Promise<Target> {
  const res = await fetchWithTimeout(apiUrl('/api/targets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(res)) as Target
}

export async function upsertInterestingTarget(payload: {
  id?: string
  name: string
  address?: string
  lat?: number
  lng?: number
}): Promise<InterestingTarget> {
  const res = await fetchWithTimeout(apiUrl('/api/interesting_targets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(res)) as InterestingTarget
}

export async function listInterestingTargets(): Promise<InterestingTarget[]> {
  const res = await fetchWithTimeout(apiUrl('/api/interesting_targets'), {
    method: 'GET',
    headers: authHeaders(),
  })
  return (await parseJsonOrThrow(res)) as InterestingTarget[]
}

export async function deleteInterestingTarget(id: string): Promise<void> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/interesting_targets/${encodeURIComponent(id)}`),
    {
      method: 'DELETE',
      headers: authHeaders(),
    },
  )
  await parseJsonOrThrow(res)
}

export async function fetchCompare(targetId?: string): Promise<CompareResponse> {
  const url = new URL(apiUrl('/api/compare'))
  if (targetId) url.searchParams.set('target_id', targetId)
  const res = await fetchWithTimeout(url.toString(), { method: 'GET', headers: authHeaders() })
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
  const res = await fetchWithTimeout(url.toString(), { method: 'GET', headers: authHeaders() })
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
  const res = await fetchWithTimeout(url.toString(), { method: 'GET', headers: authHeaders() })
  return (await parseJsonOrThrow(res)) as ReverseGeocodeResponse
}
