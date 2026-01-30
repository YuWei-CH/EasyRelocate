importScripts('api.js')

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'EASYRELOCATE_ADD_LISTING') return

  ;(async () => {
    const data = await postToApi('/api/listings', message.payload)
    sendResponse({ ok: true, data })
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err?.message ?? err) })
  })

  return true
})
