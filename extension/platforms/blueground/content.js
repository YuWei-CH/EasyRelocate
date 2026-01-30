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

function canonicalUrl(href) {
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
  // Wait a bit for Blueground client rendering to settle.
  await sleep(1200)
  createOverlay()
}

void boot()
