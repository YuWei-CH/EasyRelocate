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

function setStatus(text, isError = false) {
  const el = document.getElementById('status')
  el.textContent = text
  el.classList.toggle('error', isError)
}

async function load() {
  const items = await storageGet({ apiBaseUrl: DEFAULT_API_BASE_URL })
  document.getElementById('apiBaseUrl').value = items.apiBaseUrl || DEFAULT_API_BASE_URL
}

async function save() {
  const input = document.getElementById('apiBaseUrl')
  const next = normalizeBaseUrl(input.value)
  try {
    await storageSet({ apiBaseUrl: next })
    setStatus('Saved.')
  } catch (e) {
    setStatus(`Failed to save: ${String(e?.message ?? e)}`, true)
  }
}

document.getElementById('save').addEventListener('click', () => void save())
void load()

