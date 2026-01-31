function setStatus(text, isError = false) {
  const el = document.getElementById('status')
  el.textContent = text
  el.classList.toggle('error', isError)
}

async function load() {
  const current = await getApiBaseUrl()
  document.getElementById('apiBaseUrl').value = current

  const token = await getWorkspaceToken()
  document.getElementById('workspaceToken').value = token
}

async function save() {
  const input = document.getElementById('apiBaseUrl')
  try {
    await setApiBaseUrl(input.value)
    const tokenInput = document.getElementById('workspaceToken')
    await setWorkspaceToken(tokenInput.value)
    setStatus('Saved.')
  } catch (e) {
    setStatus(`Failed to save: ${String(e?.message ?? e)}`, true)
  }
}

document.getElementById('save').addEventListener('click', () => void save())
void load()
