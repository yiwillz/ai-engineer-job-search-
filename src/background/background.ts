import { handleMessage } from './agentOrchestrator'

// ─── Message router ───────────────────────────────────────────────────────────
// Content script fire-and-forget messages (CONTENT_READY, LINKS_RESULT,
// JD_TEXT_RESULT, NEXT_PAGE_RESULT) are handled async but we ACK immediately
// so the channel can close. Popup messages that need a data reply keep the
// channel open by returning true.

const FIRE_AND_FORGET = new Set([
  'CONTENT_READY',
  'LINKS_RESULT',
  'JD_TEXT_RESULT',
])

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (FIRE_AND_FORGET.has(message.type)) {
      // Respond immediately — SW can't keep channel open reliably for these
      sendResponse({ ok: true })
      handleMessage(message, sender).catch(err => {
        console.error('[background] Error handling', message.type, err)
      })
      return false
    }

    // Popup messages (START_TASK, STOP_TASK, GET_STATE, EXPORT_CSV) need async reply
    handleMessage(message, sender)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('[background] Unhandled error in message handler:', err)
        sendResponse({ error: String(err) })
      })
    return true
  }
)

// ─── Tab navigation listener ──────────────────────────────────────────────────
// Fallback: if a content script fails to send CONTENT_READY (e.g. slow load),
// we do nothing — the content script's DOMContentLoaded handler is the trigger.
// This listener just logs for debugging.

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    console.debug(`[background] Tab ${tabId} started loading: ${changeInfo.url ?? ''}`)
  }
})
