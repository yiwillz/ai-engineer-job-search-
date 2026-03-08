import type { SiteAdapter } from './adapters/SiteAdapter'
import { LinkedInAdapter } from './adapters/LinkedInAdapter'
import { IndeedAdapter } from './adapters/IndeedAdapter'
import { BossAdapter } from './adapters/BossAdapter'
import type { Message, LinksResultPayload, JdTextResultPayload } from '../shared/types'

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createAdapter(): SiteAdapter | null {
  const host = window.location.hostname
  if (host.includes('linkedin')) return new LinkedInAdapter()   // matches linkedin.com AND linkedin.cn
  if (host.includes('indeed.com')) return new IndeedAdapter()
  if (host.includes('zhipin.com')) return new BossAdapter()
  return null
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

function sendToBackground(message: Message): void {
  chrome.runtime.sendMessage(message).catch(err => {
    // Ignore "Extension context invalidated" errors on page unload
    if (!String(err).includes('Extension context invalidated')) {
      console.error('[content] sendToBackground error:', err)
    }
  })
}

// ─── Command handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    // Acknowledge receipt immediately so the background's sendMessage resolves
    sendResponse({ ok: true })

    const adapter = createAdapter()
    if (!adapter) return

    switch (message.type) {
      case 'EXTRACT_LINKS': {
        adapter.extractJobLinks()
          .then(links => {
            const payload: LinksResultPayload = { links }
            sendToBackground({ type: 'LINKS_RESULT', payload })
          })
          .catch(err => {
            console.error('[content] extractJobLinks failed:', err)
            sendToBackground({ type: 'LINKS_RESULT', payload: { links: [] } })
          })
        break
      }

      case 'EXTRACT_JD_TEXT': {
        adapter.extractJobDetailText()
          .then(text => {
            const payload: JdTextResultPayload = { text, url: window.location.href }
            sendToBackground({ type: 'JD_TEXT_RESULT', payload })
          })
          .catch(err => {
            console.error('[content] extractJobDetailText failed:', err)
            // Send empty text — LLM will return null, orchestrator will skip
            const payload: JdTextResultPayload = { text: '', url: window.location.href }
            sendToBackground({ type: 'JD_TEXT_RESULT', payload })
          })
        break
      }

    }

    // Return false — sendResponse already called synchronously above
    return false
  }
)

// ─── Startup: notify background this page is ready ───────────────────────────
// Fires after DOM is idle (run_at: document_idle in manifest).
// Background's onContentReady() will decide the next step based on TaskState.

sendToBackground({ type: 'CONTENT_READY' })
