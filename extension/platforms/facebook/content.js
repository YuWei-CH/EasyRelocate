function extractSelectedText() {
  const sel = window.getSelection ? window.getSelection() : null
  return (sel?.toString() ?? '').trim()
}

function extractListingSnapshot() {
  const text = extractSelectedText()
  if (!text) {
    throw new Error('Select some text in a post first, then click “Add Selected Post”.')
  }
  return {
    text: text.slice(0, 20000),
    page_url: window.location.href,
  }
}

if (globalThis.EasyRelocateOverlay && typeof globalThis.EasyRelocateOverlay.boot === 'function') {
  void globalThis.EasyRelocateOverlay.boot({
    extractListingSnapshot,
    buttonText: 'Add Selected Post',
    messageType: 'EASYRELOCATE_ADD_LISTING_FROM_TEXT',
    initialDelayMs: 1200,
  })
}

