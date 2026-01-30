const ROOT_ID = 'easyrelocate-root'
const OVERLAY_POS_KEY = 'easyrelocate_overlay_pos_v1'
const OVERLAY_MARGIN_PX = 10

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function storageGet(keysWithDefaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keysWithDefaults, (items) => resolve(items))
    } catch {
      resolve(keysWithDefaults)
    }
  })
}

function storageSet(items) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(items, () => resolve())
    } catch {
      resolve()
    }
  })
}

function canonicalAirbnbUrl(href) {
  try {
    const url = new URL(href)
    return `${url.origin}${url.pathname}`.replace(/\/$/, '')
  } catch {
    return href
  }
}

function parseNumber(value) {
  if (value == null) return null
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function currencyFromSymbol(sym) {
  if (sym === '$') return 'USD'
  if (sym === '€') return 'EUR'
  if (sym === '£') return 'GBP'
  return null
}

function parsePriceFromText(text) {
  if (!text) return { price_value: null, currency: null, price_period: null }
  const t = text.replace(/\s+/g, ' ').trim()

  let currency = null
  let price_value = null

  const symMatch = t.match(/([$€£])\s?(\d[\d,]*(?:\.\d+)?)/)
  if (symMatch) {
    currency = currencyFromSymbol(symMatch[1])
    price_value = parseNumber(symMatch[2])
  } else {
    const codeMatch = t.match(/\b([A-Z]{3})\s?(\d[\d,]*(?:\.\d+)?)\b/)
    if (codeMatch) {
      currency = codeMatch[1]
      price_value = parseNumber(codeMatch[2])
    }
  }

  let price_period = null
  if (/\bnight\b/i.test(t)) price_period = 'night'
  else if (/\bmonth\b/i.test(t)) price_period = 'month'
  else if (/\btotal\b/i.test(t)) price_period = 'total'

  return { price_value, currency, price_period }
}

function metaContent(selector) {
  const v = document.querySelector(selector)?.getAttribute('content')
  return v && typeof v === 'string' ? v.trim() : null
}

function extractFromMeta() {
  const latCandidates = [
    metaContent('meta[property="place:location:latitude"]'),
    metaContent('meta[property="airbnb:location:latitude"]'),
    metaContent('meta[property="og:latitude"]'),
  ]
  const lngCandidates = [
    metaContent('meta[property="place:location:longitude"]'),
    metaContent('meta[property="airbnb:location:longitude"]'),
    metaContent('meta[property="og:longitude"]'),
  ]

  let lat = null
  for (const c of latCandidates) {
    lat = parseNumber(c)
    if (lat != null) break
  }
  let lng = null
  for (const c of lngCandidates) {
    lng = parseNumber(c)
    if (lng != null) break
  }

  // Some pages use geo.position / ICBM formats.
  if (lat == null || lng == null) {
    const geoPos = metaContent('meta[name="geo.position"]')
    if (geoPos) {
      const [a, b] = geoPos.split(/[;,]/).map((x) => x.trim())
      const glat = parseNumber(a)
      const glng = parseNumber(b)
      if (glat != null && glng != null) {
        lat = glat
        lng = glng
      }
    }
  }
  if (lat == null || lng == null) {
    const icbm = metaContent('meta[name="ICBM"]')
    if (icbm) {
      const [a, b] = icbm.split(/[,;]/).map((x) => x.trim())
      const ilat = parseNumber(a)
      const ilng = parseNumber(b)
      if (ilat != null && ilng != null) {
        lat = ilat
        lng = ilng
      }
    }
  }

  const locality =
    metaContent('meta[property="og:locality"]') ??
    metaContent('meta[property="airbnb:locality"]') ??
    null
  const region =
    metaContent('meta[property="og:region"]') ??
    metaContent('meta[property="airbnb:region"]') ??
    null
  const country =
    metaContent('meta[property="og:country-name"]') ??
    metaContent('meta[property="airbnb:country"]') ??
    null

  const parts = []
  if (locality) parts.push(locality)
  if (region) parts.push(region)
  if (country) parts.push(country)
  const location_text = parts.length ? parts.join(', ') : null

  return { lat, lng, location_text }
}

function collectJsonObjects(value, out, limit, seen) {
  if (!value || out.length >= limit) return
  if (typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) collectJsonObjects(item, out, limit, seen)
    return
  }

  out.push(value)
  for (const k of Object.keys(value)) {
    collectJsonObjects(value[k], out, limit, seen)
    if (out.length >= limit) return
  }
}

function extractFromJsonLd() {
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  )
  const best = {
    title: null,
    location_text: null,
    lat: null,
    lng: null,
    currency: null,
    price_value: null,
  }
  for (const s of scripts) {
    const raw = s.textContent?.trim()
    if (!raw) continue

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    const nodes = []
    collectJsonObjects(parsed, nodes, 200, new Set())

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue

      if (best.title == null && typeof node.name === 'string') best.title = node.name

      let location_text = best.location_text
      const address = node.address
      if (address && typeof address === 'object') {
        const parts = []
        if (address.addressLocality) parts.push(address.addressLocality)
        if (address.addressRegion) parts.push(address.addressRegion)
        if (address.addressCountry) parts.push(address.addressCountry)
        if (parts.length) location_text = parts.join(', ')
      }
      if (best.location_text == null && location_text) best.location_text = location_text

      let lat = null
      let lng = null
      if (node.geo && typeof node.geo === 'object' && (best.lat == null || best.lng == null)) {
        lat = parseNumber(node.geo.latitude)
        lng = parseNumber(node.geo.longitude)
      }
      if (best.lat == null && lat != null) best.lat = lat
      if (best.lng == null && lng != null) best.lng = lng

      let currency = null
      let price_value = null
      if (node.offers && (best.currency == null || best.price_value == null)) {
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
        if (offer && typeof offer === 'object') {
          if (typeof offer.priceCurrency === 'string') currency = offer.priceCurrency
          price_value = parseNumber(offer.price)
        }
      }
      if (best.currency == null && currency) best.currency = currency
      if (best.price_value == null && price_value != null) best.price_value = price_value
    }
  }
  if (
    best.title != null ||
    best.location_text != null ||
    (best.lat != null && best.lng != null) ||
    (best.currency != null && best.price_value != null)
  ) {
    return best
  }
  return {}
}

function isValidLatLng(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function isWithinUsBounds(lat, lng) {
  return lat >= 24.396308 && lat <= 49.384358 && lng >= -125.0011 && lng <= -66.93457
}

function extractFirstLatLng(text) {
  if (!text) return null
  const m = String(text).match(
    /(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/,
  )
  if (!m) return null
  const lat = parseNumber(m[1])
  const lng = parseNumber(m[2])
  if (lat == null || lng == null) return null
  if (!isValidLatLng(lat, lng)) return null
  return { lat, lng }
}

function extractLatLngFromGoogleMapsUrl(href) {
  if (!href || typeof href !== 'string') return null
  let url
  try {
    url = new URL(href, window.location.href)
  } catch {
    return null
  }

  // Common format: /.../@lat,lng,17z
  const atMatch = url.pathname.match(
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  )
  if (atMatch) {
    const lat = parseNumber(atMatch[1])
    const lng = parseNumber(atMatch[2])
    if (lat != null && lng != null && isValidLatLng(lat, lng)) return { lat, lng }
  }

  const params = url.searchParams
  for (const key of ['q', 'query', 'center', 'll', 'destination', 'daddr', 'origin', 'saddr']) {
    const v = params.get(key)
    const found = extractFirstLatLng(v)
    if (found) return found
  }

  // Static map style params sometimes appear in deep links.
  const markers = params.getAll('markers')
  for (const m of markers) {
    const found = extractFirstLatLng(m)
    if (found) return found
  }

  return null
}

function extractLatLngFromGoogleMapsLinks() {
  const anchors = Array.from(document.querySelectorAll('a[href]'))
  for (const a of anchors) {
    const href = a.getAttribute('href')
    if (!href) continue
    if (
      !href.includes('google.com/maps') &&
      !href.includes('maps.google.com') &&
      !href.includes('www.google.com/maps')
    ) {
      continue
    }
    const found = extractLatLngFromGoogleMapsUrl(href)
    if (found) return found
  }
  return null
}

function extractLatLngFromGoogleStaticMapImages() {
  const images = Array.from(document.querySelectorAll('img[src]'))
  for (const img of images) {
    const src = img.getAttribute('src')
    if (!src) continue
    if (!src.includes('googleapis.com/maps/api/staticmap')) continue
    const found = extractLatLngFromGoogleMapsUrl(src)
    if (found) return found
  }
  return null
}

function scoreLatLngCandidate(lat, lng, context) {
  let score = 0
  if (isWithinUsBounds(lat, lng)) score += 50
  const ctx = (context || '').toLowerCase()
  if (ctx.includes('map')) score += 10
  if (ctx.includes('location')) score += 6
  if (ctx.includes('listing')) score += 4
  if (ctx.includes('lat') && ctx.includes('lng')) score += 2
  return score
}

function extractLatLngFromScriptText() {
  const scripts = Array.from(document.querySelectorAll('script'))
  let best = null
  let bestScore = -Infinity

  const patterns = [
    /"lat"\s*:\s*"?(-?\d{1,2}(?:\.\d+)?)"?[\s\S]{0,120}?"lng"\s*:\s*"?(-?\d{1,3}(?:\.\d+)?)"?/g,
    /"latitude"\s*:\s*"?(-?\d{1,2}(?:\.\d+)?)"?[\s\S]{0,120}?"longitude"\s*:\s*"?(-?\d{1,3}(?:\.\d+)?)"?/g,
  ]

  for (const s of scripts) {
    const text = s.textContent
    if (!text || text.length < 200) continue
    if (text.length > 900_000) continue
    if (
      !text.includes('lat') &&
      !text.includes('lng') &&
      !text.includes('latitude') &&
      !text.includes('longitude')
    ) {
      continue
    }

    for (const re of patterns) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text)) !== null) {
        const lat = parseNumber(m[1])
        const lng = parseNumber(m[2])
        if (lat == null || lng == null) continue
        if (!isValidLatLng(lat, lng)) continue

        const start = Math.max(0, m.index - 120)
        const end = Math.min(text.length, m.index + 180)
        const ctx = text.slice(start, end)
        const score = scoreLatLngCandidate(lat, lng, ctx)
        if (score > bestScore) {
          bestScore = score
          best = { lat, lng }
        }
        if (bestScore >= 60) return best
      }
    }
  }

  return best
}

function extractListingSnapshot() {
  const canonicalHref = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href')
  const source_url = canonicalAirbnbUrl(canonicalHref || window.location.href)
  const captured_at = new Date().toISOString()

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null
  const h1 = document.querySelector('h1')?.textContent?.trim() ?? null
  const jsonld = extractFromJsonLd()
  const meta = extractFromMeta()

  const title = ogTitle || h1 || jsonld.title || null
  const location_text = jsonld.location_text || meta.location_text || null
  let lat = jsonld.lat ?? meta.lat ?? null
  let lng = jsonld.lng ?? meta.lng ?? null

  if (lat == null || lng == null) {
    const found =
      extractLatLngFromGoogleMapsLinks() ||
      extractLatLngFromGoogleStaticMapImages() ||
      extractLatLngFromScriptText()
    if (found) {
      lat = found.lat
      lng = found.lng
    }
  }

  let currency = jsonld.currency ?? null
  let price_value = jsonld.price_value ?? null
  let price_period = null

  // Fallback price parsing from common text patterns on page
  if (price_value == null) {
    const bodyText = document.body?.innerText ?? ''
    const quick = parsePriceFromText(bodyText.slice(0, 5000))
    price_value = quick.price_value
    currency = currency ?? quick.currency
    price_period = quick.price_period
  }

  return {
    source: 'airbnb',
    source_url,
    title,
    price_value,
    currency: currency || 'USD',
    price_period: price_period || 'unknown',
    lat,
    lng,
    location_text,
    captured_at,
  }
}

function showToast(message, kind = 'info') {
  const el = document.createElement('div')
  el.textContent = message
  el.style.position = 'fixed'
  el.style.right = '16px'
  el.style.bottom = '16px'
  el.style.zIndex = '2147483647'
  el.style.padding = '10px 12px'
  el.style.borderRadius = '10px'
  el.style.border = '1px solid rgba(0,0,0,0.08)'
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'
  el.style.background = kind === 'error' ? '#fee2e2' : '#ffffff'
  el.style.color = '#0f172a'
  el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  el.style.fontSize = '13px'
  document.documentElement.appendChild(el)
  setTimeout(() => el.remove(), 2400)
}

function clampOverlayPosition(root, left, top) {
  const rect = root.getBoundingClientRect()
  const maxLeft = window.innerWidth - rect.width - OVERLAY_MARGIN_PX
  const maxTop = window.innerHeight - rect.height - OVERLAY_MARGIN_PX
  return {
    left: clamp(left, OVERLAY_MARGIN_PX, Math.max(OVERLAY_MARGIN_PX, maxLeft)),
    top: clamp(top, OVERLAY_MARGIN_PX, Math.max(OVERLAY_MARGIN_PX, maxTop)),
  }
}

function applyOverlayPosition(root, left, top) {
  const clamped = clampOverlayPosition(root, left, top)
  root.style.left = `${clamped.left}px`
  root.style.top = `${clamped.top}px`
  root.style.right = 'auto'
  root.style.bottom = 'auto'
}

async function loadOverlayPosition(root) {
  const items = await storageGet({ [OVERLAY_POS_KEY]: null })
  const pos = items[OVERLAY_POS_KEY]
  if (!pos || typeof pos !== 'object') return
  const left = Number(pos.left)
  const top = Number(pos.top)
  if (!Number.isFinite(left) || !Number.isFinite(top)) return
  applyOverlayPosition(root, left, top)
}

function createOverlay() {
  if (document.getElementById(ROOT_ID)) return

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.style.position = 'fixed'
  root.style.top = '16px'
  root.style.right = '16px'
  root.style.zIndex = '2147483647'
  root.style.userSelect = 'none'
  root.style.touchAction = 'none'

  const btn = document.createElement('button')
  btn.textContent = 'Add to Compare'
  btn.style.display = 'inline-flex'
  btn.style.alignItems = 'center'
  btn.style.gap = '8px'
  btn.style.border = '1px solid rgba(15,23,42,0.14)'
  btn.style.background = 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 120%)'
  btn.style.color = '#ffffff'
  btn.style.borderRadius = '999px'
  btn.style.padding = '10px 14px'
  btn.style.fontSize = '13px'
  btn.style.fontWeight = '650'
  btn.style.cursor = 'pointer'
  btn.style.boxShadow = '0 10px 26px rgba(2,6,23,0.18)'
  btn.style.letterSpacing = '0.2px'
  btn.style.fontFamily =
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  btn.style.transition = 'filter 140ms ease, transform 80ms ease'

  const plus = document.createElement('span')
  plus.textContent = '+'
  plus.style.display = 'inline-grid'
  plus.style.placeItems = 'center'
  plus.style.width = '18px'
  plus.style.height = '18px'
  plus.style.borderRadius = '999px'
  plus.style.background = 'rgba(255,255,255,0.18)'
  plus.style.fontWeight = '800'
  plus.style.lineHeight = '1'
  plus.style.flexShrink = '0'
  btn.prepend(plus)

  let isDragging = false
  let didDrag = false
  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0

  function ensureLeftTopPositioning() {
    if (root.style.left) return
    const rect = root.getBoundingClientRect()
    root.style.left = `${rect.left}px`
    root.style.top = `${rect.top}px`
    root.style.right = 'auto'
    root.style.bottom = 'auto'
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    btn.setPointerCapture(e.pointerId)
    ensureLeftTopPositioning()
    const rect = root.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    startLeft = rect.left
    startTop = rect.top
    isDragging = true
    didDrag = false
    btn.style.transform = 'scale(0.98)'
  })

  btn.addEventListener('pointermove', (e) => {
    if (!isDragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!didDrag && Math.hypot(dx, dy) < 6) return
    didDrag = true
    applyOverlayPosition(root, startLeft + dx, startTop + dy)
  })

  async function finishDrag(e) {
    if (!isDragging) return
    isDragging = false
    btn.style.transform = ''
    try {
      btn.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!didDrag) return
    const rect = root.getBoundingClientRect()
    await storageSet({
      [OVERLAY_POS_KEY]: { left: rect.left, top: rect.top },
    })
  }

  btn.addEventListener('pointerup', (e) => void finishDrag(e))
  btn.addEventListener('pointercancel', (e) => void finishDrag(e))

  btn.addEventListener('mouseenter', () => {
    btn.style.filter = 'brightness(1.03)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.filter = ''
    btn.style.transform = ''
  })

  btn.addEventListener('click', async () => {
    if (didDrag) {
      didDrag = false
      return
    }
    btn.disabled = true
    btn.style.opacity = '0.75'
    try {
      const payload = extractListingSnapshot()
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'EASYRELOCATE_ADD_LISTING', payload }, (resp) =>
          resolve(resp),
        )
      })
      if (res && res.ok) {
        showToast('Saved to EasyRelocate.')
      } else {
        showToast(`Failed: ${res?.error ?? 'Unknown error'}`, 'error')
      }
    } catch (e) {
      showToast(`Failed: ${String(e?.message ?? e)}`, 'error')
    } finally {
      btn.disabled = false
      btn.style.opacity = '1'
    }
  })

  root.appendChild(btn)
  document.documentElement.appendChild(root)

  void loadOverlayPosition(root)
  window.addEventListener(
    'resize',
    () => {
      if (!root.style.left) return
      const rect = root.getBoundingClientRect()
      applyOverlayPosition(root, rect.left, rect.top)
    },
    { passive: true },
  )
}

async function boot() {
  // Wait a bit for Airbnb client rendering to settle.
  await sleep(1200)
  createOverlay()
}

void boot()
