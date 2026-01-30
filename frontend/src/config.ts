function normalizeBaseUrl(v: string): string {
  const raw = String(v || '').trim()
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

function envFlag(v: unknown): boolean {
  const raw = String(v ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export const API_BASE_URL = normalizeBaseUrl(
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'),
)

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

export const GOOGLE_MAPS_API_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ''
).trim()

export const DISABLE_GOOGLE_MAPS = envFlag(import.meta.env.VITE_DISABLE_GOOGLE_MAPS)

export function requireGoogleMapsApiKey(): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is not set. Set it in the repo-root .env (copy .env.example -> .env).',
    )
  }
  return GOOGLE_MAPS_API_KEY
}
