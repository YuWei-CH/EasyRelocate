;(function () {
  const REQUEST_TYPE = 'EASYRELOCATE_PAIR_REQUEST'
  const RESULT_TYPE = 'EASYRELOCATE_PAIR_RESULT'
  const PAIR_HASH = '/onboarding/token'

  function shouldHandle() {
    return typeof location !== 'undefined' && location.hash.includes(PAIR_HASH)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!shouldHandle()) return
    if (event.origin !== window.location.origin) return

    const data = event.data || {}
    if (data.type !== REQUEST_TYPE) return

    const token = String(data.token || '').trim()
    if (!token) {
      window.postMessage(
        { type: RESULT_TYPE, ok: false, error: 'Missing token' },
        window.location.origin
      )
      return
    }

    try {
      chrome.runtime.sendMessage(
        { type: 'EASYRELOCATE_SET_WORKSPACE_TOKEN', token },
        (response) => {
          const err = chrome.runtime.lastError
          if (err) {
            window.postMessage(
              { type: RESULT_TYPE, ok: false, error: err.message || String(err) },
              window.location.origin
            )
            return
          }
          if (!response?.ok) {
            window.postMessage(
              { type: RESULT_TYPE, ok: false, error: response?.error || 'Pairing failed' },
              window.location.origin
            )
            return
          }
          window.postMessage({ type: RESULT_TYPE, ok: true }, window.location.origin)
        }
      )
    } catch (e) {
      window.postMessage(
        { type: RESULT_TYPE, ok: false, error: e?.message || String(e) },
        window.location.origin
      )
    }
  })
})()
