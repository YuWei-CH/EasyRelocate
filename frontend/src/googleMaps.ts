import { requireGoogleMapsApiKey } from './config'

let googleMapsPromise: Promise<void> | null = null

export async function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.google?.maps) return

  const apiKey = requireGoogleMapsApiKey()

  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-easyrelocate="gmap"]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Maps JS API')),
      )
      return
    }

    const callbackName = '__easyrelocateInitGoogleMaps'
    const previousCallback = (window as unknown as Record<string, unknown>)[callbackName]

    ;(window as unknown as Record<string, unknown>)[callbackName] = () => {
      if (previousCallback && typeof previousCallback === 'function') {
        try {
          ;(previousCallback as () => void)()
        } catch {
          // ignore
        }
      }
      resolve()
    }

    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      callback: callbackName,
    })
    const script = document.createElement('script')
    script.dataset.easyrelocate = 'gmap'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}
