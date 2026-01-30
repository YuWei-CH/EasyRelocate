const DEFAULT_API_BASE_URL = 'http://localhost:8000'

function storageGet(keysWithDefaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keysWithDefaults, (items) => resolve(items))
  })
}

function storageSet(items) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(items, () => resolve())
  })
}

function normalizeBaseUrl(v) {
  const raw = String(v || '').trim()
  if (!raw) return DEFAULT_API_BASE_URL
  return raw.replace(/\/$/, '')
}

async function getApiBaseUrl() {
  const items = await storageGet({ apiBaseUrl: DEFAULT_API_BASE_URL })
  return normalizeBaseUrl(items.apiBaseUrl)
}

async function setApiBaseUrl(v) {
  const next = normalizeBaseUrl(v)
  await storageSet({ apiBaseUrl: next })
  return next
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`)
  }
  return text ? JSON.parse(text) : null
}

async function postToApi(path, payload) {
  const base = await getApiBaseUrl()
  const full = `${base}${path.startsWith('/') ? '' : '/'}${path}`
  return postJson(full, payload)
}

