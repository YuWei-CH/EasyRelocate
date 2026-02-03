importScripts('api.js')

const MENU_ID_ADD_SELECTION = 'easyrelocate_add_selection_v1'

function setActionBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text })
    chrome.action.setBadgeBackgroundColor({ color })
  } catch {
    // ignore
  }
}

function setupContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID_ADD_SELECTION,
        title: 'EasyRelocate: Add selected post',
        contexts: ['selection'],
      })
    })
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(() => setupContextMenus())
chrome.runtime.onStartup?.addListener(() => setupContextMenus())

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID_ADD_SELECTION) return

  const text = String(info.selectionText || '').trim()
  const pageUrl = String(info.pageUrl || tab?.url || '').trim()
  if (!text) return
  if (!pageUrl) return

  setActionBadge('…', '#64748b')

  ;(async () => {
    await postToApi('/api/listings/from_text', { text: text.slice(0, 20000), page_url: pageUrl })
    setActionBadge('✓', '#16a34a')
    setTimeout(() => setActionBadge('', '#64748b'), 2500)
  })().catch((_err) => {
    setActionBadge('!', '#dc2626')
    setTimeout(() => setActionBadge('', '#64748b'), 3500)
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return

  ;(async () => {
    if (message.type === 'EASYRELOCATE_SET_WORKSPACE_TOKEN') {
      const token = String(message.token || '').trim()
      await setWorkspaceToken(token)
      sendResponse({ ok: true })
      return
    }
    const path =
      message.type === 'EASYRELOCATE_ADD_LISTING_FROM_TEXT'
        ? '/api/listings/from_text'
        : message.type === 'EASYRELOCATE_ADD_LISTING'
          ? '/api/listings'
          : null
    if (!path) {
      sendResponse({ ok: false, error: 'Unsupported message type' })
      return
    }
    const data = await postToApi(path, message.payload)
    sendResponse({ ok: true, data })
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err?.message ?? err) })
  })

  return true
})
