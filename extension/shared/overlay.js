const EASYRELOCATE_OVERLAY_ROOT_ID = 'easyrelocate-root'
const EASYRELOCATE_OVERLAY_POS_KEY = 'easyrelocate_overlay_pos_v1'
const EASYRELOCATE_OVERLAY_MARGIN_PX = 10

function easyRelocateSleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function easyRelocateStorageGet(keysWithDefaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keysWithDefaults, (items) => resolve(items))
    } catch {
      resolve(keysWithDefaults)
    }
  })
}

function easyRelocateStorageSet(items) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(items, () => resolve())
    } catch {
      resolve()
    }
  })
}

function easyRelocateClamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function easyRelocateShowToast(message, kind = 'info') {
  const el = document.createElement('div')
  el.textContent = message
  el.style.position = 'fixed'
  el.style.right = '16px'
  el.style.bottom = '16px'
  el.style.zIndex = '2147483647'
  el.style.padding = '10px 12px'
  el.style.borderRadius = '10px'
  el.style.border = '1px solid rgba(0,0,0,0.08)'
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'
  el.style.background = kind === 'error' ? '#fee2e2' : '#ffffff'
  el.style.color = '#0f172a'
  el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  el.style.fontSize = '13px'
  document.documentElement.appendChild(el)
  setTimeout(() => el.remove(), 2400)
}

function easyRelocateClampOverlayPosition(root, left, top) {
  const rect = root.getBoundingClientRect()
  const maxLeft = window.innerWidth - rect.width - EASYRELOCATE_OVERLAY_MARGIN_PX
  const maxTop = window.innerHeight - rect.height - EASYRELOCATE_OVERLAY_MARGIN_PX
  return {
    left: easyRelocateClamp(
      left,
      EASYRELOCATE_OVERLAY_MARGIN_PX,
      Math.max(EASYRELOCATE_OVERLAY_MARGIN_PX, maxLeft),
    ),
    top: easyRelocateClamp(
      top,
      EASYRELOCATE_OVERLAY_MARGIN_PX,
      Math.max(EASYRELOCATE_OVERLAY_MARGIN_PX, maxTop),
    ),
  }
}

function easyRelocateApplyOverlayPosition(root, left, top) {
  const clamped = easyRelocateClampOverlayPosition(root, left, top)
  root.style.left = `${clamped.left}px`
  root.style.top = `${clamped.top}px`
  root.style.right = 'auto'
  root.style.bottom = 'auto'
}

async function easyRelocateLoadOverlayPosition(root) {
  const items = await easyRelocateStorageGet({ [EASYRELOCATE_OVERLAY_POS_KEY]: null })
  const pos = items[EASYRELOCATE_OVERLAY_POS_KEY]
  if (!pos || typeof pos !== 'object') return
  const left = Number(pos.left)
  const top = Number(pos.top)
  if (!Number.isFinite(left) || !Number.isFinite(top)) return
  easyRelocateApplyOverlayPosition(root, left, top)
}

function easyRelocateCreateOverlay(opts) {
  if (document.getElementById(EASYRELOCATE_OVERLAY_ROOT_ID)) return
  if (!opts || typeof opts.extractListingSnapshot !== 'function') return

  const root = document.createElement('div')
  root.id = EASYRELOCATE_OVERLAY_ROOT_ID
  root.style.position = 'fixed'
  root.style.top = '16px'
  root.style.right = '16px'
  root.style.zIndex = '2147483647'
  root.style.userSelect = 'none'
  root.style.touchAction = 'none'

  const btn = document.createElement('button')
  btn.textContent = opts.buttonText || 'Add to Compare'
  btn.style.display = 'inline-flex'
  btn.style.alignItems = 'center'
  btn.style.gap = '8px'
  btn.style.border = '1px solid rgba(15,23,42,0.14)'
  btn.style.background = 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 120%)'
  btn.style.color = '#ffffff'
  btn.style.borderRadius = '999px'
  btn.style.padding = '10px 14px'
  btn.style.fontSize = '13px'
  btn.style.fontWeight = '650'
  btn.style.cursor = 'pointer'
  btn.style.boxShadow = '0 10px 26px rgba(2,6,23,0.18)'
  btn.style.letterSpacing = '0.2px'
  btn.style.fontFamily =
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  btn.style.transition = 'filter 140ms ease, transform 80ms ease'

  const plus = document.createElement('span')
  plus.textContent = '+'
  plus.style.display = 'inline-grid'
  plus.style.placeItems = 'center'
  plus.style.width = '18px'
  plus.style.height = '18px'
  plus.style.borderRadius = '999px'
  plus.style.background = 'rgba(255,255,255,0.18)'
  plus.style.fontWeight = '800'
  plus.style.lineHeight = '1'
  plus.style.flexShrink = '0'
  btn.prepend(plus)

  let isDragging = false
  let didDrag = false
  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0

  function ensureLeftTopPositioning() {
    if (root.style.left) return
    const rect = root.getBoundingClientRect()
    root.style.left = `${rect.left}px`
    root.style.top = `${rect.top}px`
    root.style.right = 'auto'
    root.style.bottom = 'auto'
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    btn.setPointerCapture(e.pointerId)
    ensureLeftTopPositioning()
    const rect = root.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    startLeft = rect.left
    startTop = rect.top
    isDragging = true
    didDrag = false
    btn.style.transform = 'scale(0.98)'
  })

  btn.addEventListener('pointermove', (e) => {
    if (!isDragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!didDrag && Math.hypot(dx, dy) < 6) return
    didDrag = true
    easyRelocateApplyOverlayPosition(root, startLeft + dx, startTop + dy)
  })

  async function finishDrag(e) {
    if (!isDragging) return
    isDragging = false
    btn.style.transform = ''
    try {
      btn.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!didDrag) return
    const rect = root.getBoundingClientRect()
    await easyRelocateStorageSet({
      [EASYRELOCATE_OVERLAY_POS_KEY]: { left: rect.left, top: rect.top },
    })
  }

  btn.addEventListener('pointerup', (e) => void finishDrag(e))
  btn.addEventListener('pointercancel', (e) => void finishDrag(e))

  btn.addEventListener('mouseenter', () => {
    btn.style.filter = 'brightness(1.03)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.filter = ''
    btn.style.transform = ''
  })

  btn.addEventListener('click', async () => {
    if (didDrag) {
      didDrag = false
      return
    }
    btn.disabled = true
    btn.style.opacity = '0.75'
    try {
      const payload = opts.extractListingSnapshot()
      const messageType =
        typeof opts.messageType === 'string' && opts.messageType.trim()
          ? opts.messageType.trim()
          : 'EASYRELOCATE_ADD_LISTING'
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: messageType, payload }, (resp) =>
          resolve(resp),
        )
      })
      if (res && res.ok) {
        easyRelocateShowToast('Saved to EasyRelocate.')
      } else {
        easyRelocateShowToast(`Failed: ${res?.error ?? 'Unknown error'}`, 'error')
      }
    } catch (e) {
      easyRelocateShowToast(`Failed: ${String(e?.message ?? e)}`, 'error')
    } finally {
      btn.disabled = false
      btn.style.opacity = '1'
    }
  })

  root.appendChild(btn)
  document.documentElement.appendChild(root)

  void easyRelocateLoadOverlayPosition(root)
  window.addEventListener(
    'resize',
    () => {
      if (!root.style.left) return
      const rect = root.getBoundingClientRect()
      easyRelocateApplyOverlayPosition(root, rect.left, rect.top)
    },
    { passive: true },
  )
}

async function easyRelocateBootOverlay(opts) {
  const delayMs = Number(opts?.initialDelayMs ?? 1200)
  await easyRelocateSleep(Number.isFinite(delayMs) ? delayMs : 1200)
  easyRelocateCreateOverlay(opts)
}

globalThis.EasyRelocateOverlay = globalThis.EasyRelocateOverlay || {}
globalThis.EasyRelocateOverlay.boot = easyRelocateBootOverlay
