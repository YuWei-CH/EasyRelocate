function canonicalUrl(href) {
  try {
    const url = new URL(href, window.location.href)
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
  else if (
    /\bmonth\b/i.test(t) ||
    /\bmonthly\b/i.test(t) ||
    /\/\s*mo\b/i.test(t) ||
    /\bmo\b/i.test(t)
  )
    price_period = 'month'
  else if (/\btotal\b/i.test(t)) price_period = 'total'

  return { price_value, currency, price_period }
}

function metaContent(selector) {
  const v = document.querySelector(selector)?.getAttribute('content')
  return v && typeof v === 'string' ? v.trim() : null
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractMonthlyChargesFromDom() {
  if (!document.body) return null

  const candidates = []
  const needle = 'monthly charge'

  let walker
  try {
    walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const txt = node?.nodeValue
        if (!txt) return NodeFilter.FILTER_REJECT
        return txt.toLowerCase().includes(needle)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    })
  } catch {
    return null
  }

  let node
  while ((node = walker.nextNode())) {
    const baseEl = node.parentElement
    if (!baseEl) continue

    const els = []
    let el = baseEl
    for (let i = 0; i < 5 && el; i++) {
      els.push(el)
      el = el.parentElement
    }

    for (const container of els) {
      const text = normalizeText(container.textContent)
      if (!text.toLowerCase().includes(needle)) continue

      const parsed = parsePriceFromText(text)
      if (parsed.price_value == null) continue

      const price_value = parsed.price_value
      let currency = parsed.currency || null
      if (!currency) {
        if (text.includes('$')) currency = 'USD'
        else if (text.includes('€')) currency = 'EUR'
        else if (text.includes('£')) currency = 'GBP'
      }

      let score = 0
      score += 50
      score += currency ? 2 : 0
      score -= text.toLowerCase().includes('total') ? 4 : 0
      score += Math.min(6, Math.log10(Math.max(1, price_value)))
      candidates.push({ price_value, currency, price_period: 'month', score })
    }
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]
}

function extractPriceFromDom() {
  const candidates = []

  const selectors = [
    'span.price__amount',
    '.price__amount',
    '[class*="price__amount"]',
  ]

  const seen = new Set()
  for (const sel of selectors) {
    const els = Array.from(document.querySelectorAll(sel))
    for (const el of els) {
      if (seen.has(el)) continue
      seen.add(el)

      const amount = parseNumber(el.textContent)
      if (amount == null) continue

      const container =
        el.closest?.('[class*="price"]') || el.closest?.('[data-testid*="price"]')
      const ctxRaw = container?.textContent || el.parentElement?.textContent || ''
      const ctx = normalizeText(ctxRaw)
      const ctxLower = ctx.toLowerCase()

      const parsed = parsePriceFromText(ctx)

      const price_value = parsed.price_value != null ? parsed.price_value : amount
      let currency = parsed.currency || null
      if (!currency) {
        if (ctx.includes('$')) currency = 'USD'
        else if (ctx.includes('€')) currency = 'EUR'
        else if (ctx.includes('£')) currency = 'GBP'
      }

      const hasMonth =
        /\bmonth\b/.test(ctxLower) ||
        /\bmonthly\b/.test(ctxLower) ||
        /\/\s*mo\b/.test(ctxLower) ||
        /\bmo\b/.test(ctxLower)
      const hasTotal =
        /\btotal\b/.test(ctxLower) ||
        /\bsubtotal\b/.test(ctxLower) ||
        /\bdue\b/.test(ctxLower) ||
        /\bdue today\b/.test(ctxLower)

      // We only want monthly charges. Ignore obvious "total due" style prices unless
      // the same context also indicates "month/monthly".
      if (hasTotal && !hasMonth) continue

      const price_period = 'month'

      let score = 0
      if (el.classList?.contains('price__amount')) score += 10
      if (hasMonth) score += 20
      if (currency) score += 2
      if (/\bfee\b|\bdeposit\b|\bpet\b/i.test(ctx)) score -= 6
      score += Math.min(6, Math.log10(Math.max(1, price_value)))

      candidates.push({ price_value, currency, price_period, score })
    }
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]
}

function extractFromBluegroundPageData() {
  const scripts = Array.from(document.querySelectorAll('script'))
  for (const s of scripts) {
    const raw = s.textContent
    if (!raw || !raw.includes('Blueground.pageData')) continue

    const addressIdx = raw.indexOf('"address":{')
    const chunk = addressIdx >= 0 ? raw.slice(addressIdx, addressIdx + 2500) : raw

    const latMatch = chunk.match(/"lat"\s*:\s*(-?\d{1,2}(?:\.\d+)?)/)
    const lngMatch = chunk.match(/"lng"\s*:\s*(-?\d{1,3}(?:\.\d+)?)/)
    const lat = latMatch ? parseNumber(latMatch[1]) : null
    const lng = lngMatch ? parseNumber(lngMatch[1]) : null

    const buildingMatch = chunk.match(/"building"\s*:\s*"([^"]+)"/)
    const cityMatch = chunk.match(/"city"\s*:\s*"([^"]+)"/)
    const areaMatch = chunk.match(/"area"\s*:\s*"([^"]+)"/)

    const building = buildingMatch ? buildingMatch[1].trim() : null
    const city = cityMatch ? cityMatch[1].trim() : null
    const area = areaMatch ? areaMatch[1].trim() : null

    const parts = []
    if (building) parts.push(building)
    if (city && (building == null || !building.toLowerCase().includes(city.toLowerCase()))) {
      parts.push(city)
    }
    if (area && city && area.toLowerCase() !== city.toLowerCase()) parts.push(area)

    const location_text = parts.length ? parts.join(', ') : null
    return { lat, lng, location_text }
  }
  return {}
}

function extractListingSnapshot() {
  const canonicalHref =
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const source_url = canonicalUrl(canonicalHref || window.location.href)
  const captured_at = new Date().toISOString()

  const ogTitle = metaContent('meta[property="og:title"]')
  const h1 = document.querySelector('h1')?.textContent?.trim() ?? null
  const title = ogTitle || h1 || document.title?.trim() || null

  const bg = extractFromBluegroundPageData()
  let lat = bg.lat ?? null
  let lng = bg.lng ?? null
  let location_text = bg.location_text ?? null

  if (!location_text && ogTitle) {
    const m = ogTitle.match(/\bin\s+(.+?)\s*\|\s*Blueground\s*$/i)
    if (m) location_text = m[1].trim()
  }
  if (!location_text) {
    const desc = metaContent('meta[name="description"]')
    const m = desc?.match(/\bapartment in\s+(.+?)\./i)
    if (m) location_text = m[1].trim()
  }

  let currency = 'USD'
  let price_value = null
  let price_period = 'unknown'

  const monthlyCharges = extractMonthlyChargesFromDom()
  if (monthlyCharges) {
    price_value = monthlyCharges.price_value
    if (monthlyCharges.currency) currency = monthlyCharges.currency
    price_period = 'month'
  } else {
    const domPrice = extractPriceFromDom()
    if (domPrice) {
      price_value = domPrice.price_value
      if (domPrice.currency) currency = domPrice.currency
      price_period = 'month'
    } else {
      const bodyText = document.body?.innerText ?? ''
      const quick = parsePriceFromText(bodyText.slice(0, 9000))
      if (quick.price_period === 'month' && quick.price_value != null) {
        price_value = quick.price_value
        if (quick.currency) currency = quick.currency
        price_period = 'month'
      }
    }
  }

  return {
    source: 'blueground',
    source_url,
    title,
    price_value,
    currency,
    price_period,
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
