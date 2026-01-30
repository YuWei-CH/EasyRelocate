const DEFAULT_API_BASE_URL = 'http://localhost:8000'

function storageGet(keysWithDefaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keysWithDefaults, (items) => resolve(items))
  })
}

async function getApiBaseUrl() {
  const items = await storageGet({ apiBaseUrl: DEFAULT_API_BASE_URL })
  const raw = typeof items.apiBaseUrl === 'string' ? items.apiBaseUrl : DEFAULT_API_BASE_URL
  return raw.replace(/\/$/, '')
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'EASYRELOCATE_ADD_LISTING') return

  ;(async () => {
    const apiBaseUrl = await getApiBaseUrl()
    const data = await postJson(`${apiBaseUrl}/api/listings`, message.payload)
    sendResponse({ ok: true, data })
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err?.message ?? err) })
  })

  return true
})

