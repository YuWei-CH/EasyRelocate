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

function currencyFromSymbol(sym) {
  if (sym === '$') return 'USD'
  if (sym === '€') return 'EUR'
  if (sym === '£') return 'GBP'
  return null
}

function normalizeText(text) {
  if (!text) return ''
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function inferPricePeriodFromText(text) {
  const t = normalizeText(text).toLowerCase()
  if (!t) return null

  if (t.includes('total before taxes')) return 'total'
  if (/\btotal\b/i.test(t)) return 'total'

  if (/\bper night\b/i.test(t) || /\/\s*night\b/i.test(t)) return 'night'
  if (/\bnight\b/i.test(t)) return 'night'

  if (/\bper month\b/i.test(t) || /\/\s*month\b/i.test(t) || /\bmonthly\b/i.test(t))
    return 'month'
  if (/\bmonth\b/i.test(t)) return 'month'

  if (/\b\d+\s+nights?\b/i.test(t)) return 'total'

  return null
}

function inferAirbnbPricePeriodFromUrl() {
  try {
    const url = new URL(window.location.href)
    const hasCheckIn = url.searchParams.has('check_in')
    const hasCheckOut = url.searchParams.has('check_out')
    if (hasCheckIn && hasCheckOut) return 'total'
    return null
  } catch {
    return null
  }
}

function extractAirbnbPriceFromDom() {
  const candidates = []
  const nodes = Array.from(
    document.querySelectorAll('[style*="pricing-guest-primary-line-unit-price"]'),
  )

  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue
    const parsed = parsePriceFromText(el.textContent || '')
    if (parsed.price_value == null) continue

    const ctx =
      normalizeText(el.closest('section, aside, div')?.innerText || '') ||
      normalizeText(el.parentElement?.innerText || '')

    const period = parsed.price_period || inferPricePeriodFromText(ctx) || null

    let score = 0
    if (ctx) {
      const lower = ctx.toLowerCase()
      if (lower.includes('total before taxes')) score += 80
      else if (lower.includes('total')) score += 55
      if (/\b\d+\s+nights?\b/i.test(lower)) score += 25

      if (/additional fee/i.test(lower)) score -= 120
      else if (/\bfee\b/i.test(lower)) score -= 40
      if (/\bdeposit\b/i.test(lower)) score -= 80
    }

    if (period === 'total') score += 30
    else if (period === 'night') score += 10
    else if (period === 'month') score += 10

    candidates.push({
      price_value: parsed.price_value,
      currency: parsed.currency,
      price_period: period,
      score,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => (b.score - a.score) || (b.price_value - a.price_value))

  const best = candidates[0]
  if (!best.currency) best.currency = 'USD'

  if (!best.price_period) {
    best.price_period = inferAirbnbPricePeriodFromUrl() || 'unknown'
  }

  return best
}

function extractBestPriceFromBodyText(bodyText) {
  const t = normalizeText(bodyText)
  if (!t) return { price_value: null, currency: null, price_period: null }

  const directTotal = t.match(
    /\btotal before taxes\b[\s\S]{0,220}?([$€£])\s?(\d[\d,]*(?:\.\d+)?)/i,
  )
  if (directTotal) {
    return {
      price_value: parseNumber(directTotal[2]),
      currency: currencyFromSymbol(directTotal[1]),
      price_period: 'total',
    }
  }

  const directTotal2 = t.match(/\btotal\b[\s\S]{0,220}?([$€£])\s?(\d[\d,]*(?:\.\d+)?)/i)
  if (directTotal2) {
    return {
      price_value: parseNumber(directTotal2[2]),
      currency: currencyFromSymbol(directTotal2[1]),
      price_period: 'total',
    }
  }

  const symRe = /([$€£])\s?(\d[\d,]*(?:\.\d+)?)/g
  const candidates = []

  let m
  while ((m = symRe.exec(t)) !== null) {
    const currency = currencyFromSymbol(m[1])
    const price_value = parseNumber(m[2])
    if (price_value == null) continue

    const start = Math.max(0, m.index - 90)
    const end = Math.min(t.length, m.index + m[0].length + 90)
    const ctx = t.slice(start, end)
    const ctxLower = ctx.toLowerCase()

    let score = 0

    if (ctxLower.includes('total before taxes')) score += 100
    else if (/\btotal\b/i.test(ctx)) score += 70

    if (/\bper night\b/i.test(ctx) || /\/\s*night\b/i.test(ctx)) score += 50
    else if (/\bnight\b/i.test(ctx)) score += 40

    if (/\bper month\b/i.test(ctx) || /\/\s*month\b/i.test(ctx) || /\bmonthly\b/i.test(ctx))
      score += 35
    else if (/\bmonth\b/i.test(ctx)) score += 25

    if (/additional fee/i.test(ctx)) score -= 120
    else if (/\bfee\b/i.test(ctx)) score -= 40
    if (/\bdeposit\b/i.test(ctx)) score -= 80

    if (
      (/\btax(es)?\b/i.test(ctx) || /\boccupancy\b/i.test(ctx)) &&
      !ctxLower.includes('total before taxes') &&
      !/\btotal\b/i.test(ctx)
    ) {
      score -= 60
    }

    candidates.push({ currency, price_value, score, ctx })
  }

  if (!candidates.length) return { price_value: null, currency: null, price_period: null }

  candidates.sort((a, b) => (b.score - a.score) || (b.price_value - a.price_value))
  const best = candidates[0]

  const bestCtx = best.ctx
  let price_period = inferPricePeriodFromText(bestCtx)

  if (!price_period) return { price_value: null, currency: null, price_period: null }
  if (best.score < 35) return { price_value: null, currency: null, price_period: null }

  return { price_value: best.price_value, currency: best.currency, price_period }
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

  const bodyText = document.body?.innerText ?? ''
  const domPrice = extractAirbnbPriceFromDom()
  if (domPrice?.price_value != null) {
    const prefer =
      price_value == null ||
      domPrice.price_period === 'total' ||
      price_period == null ||
      price_period === 'unknown'
    if (prefer) {
      price_value = domPrice.price_value
      currency = currency ?? domPrice.currency
      price_period = domPrice.price_period
    }
  }

  const bestPrice = extractBestPriceFromBodyText(bodyText)
  if (bestPrice.price_value != null) {
    const prefer =
      price_value == null ||
      bestPrice.price_period === 'total' ||
      price_period == null ||
      price_period === 'unknown'
    if (prefer) {
      price_value = bestPrice.price_value
      currency = currency ?? bestPrice.currency
      price_period = bestPrice.price_period
    }
  }

  // Final fallback price parsing
  if (price_value == null) {
    const quick = parsePriceFromText(bodyText)
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

if (globalThis.EasyRelocateOverlay && typeof globalThis.EasyRelocateOverlay.boot === 'function') {
  void globalThis.EasyRelocateOverlay.boot({
    extractListingSnapshot,
    initialDelayMs: 1200,
  })
}
