function setStatus(text, isError = false) {
  const el = document.getElementById('status')
  el.textContent = text
  el.classList.toggle('error', isError)
}

async function load() {
  const current = await getApiBaseUrl()
  document.getElementById('apiBaseUrl').value = current
}

async function save() {
  const input = document.getElementById('apiBaseUrl')
  try {
    await setApiBaseUrl(input.value)
    setStatus('Saved.')
  } catch (e) {
    setStatus(`Failed to save: ${String(e?.message ?? e)}`, true)
  }
}

document.getElementById('save').addEventListener('click', () => void save())
void load()
