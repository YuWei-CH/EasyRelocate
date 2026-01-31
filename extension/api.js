const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'
const DEFAULT_WORKSPACE_TOKEN = ''

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

async function getWorkspaceToken() {
  const items = await storageGet({ workspaceToken: DEFAULT_WORKSPACE_TOKEN })
  const raw = String(items.workspaceToken || '').trim()
  return raw
}

async function setWorkspaceToken(v) {
  const raw = String(v || '').trim()
  await storageSet({ workspaceToken: raw })
  return raw
}

async function postJson(url, payload) {
  const token = await getWorkspaceToken()
  const auth = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
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
