import type { SiteAdapter } from './SiteAdapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Scroll down to trigger LinkedIn's lazy-loaded job card list, then back up. */
async function scrollToLoadCards(): Promise<void> {
  const list = document.querySelector('.jobs-search-results-list, .scaffold-layout__list')
  if (list) {
    list.scrollTop = list.scrollHeight
    await wait(1200)
    list.scrollTop = 0
  } else {
    window.scrollTo(0, document.body.scrollHeight)
    await wait(1200)
    window.scrollTo(0, 0)
  }
  await wait(500)
}

/**
 * Wait until LinkedIn's skeleton loaders disappear from the detail pane.
 * Prevents extracting text while the JD is still loading (grey placeholder blocks).
 */
async function waitForJDLoad(): Promise<void> {
  const maxWait = 6000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    // LinkedIn skeleton uses these classes while content is loading
    const skeleton = document.querySelector(
      '.jobs-description-content__text--stretch .loading-skeleton, ' +
      '[class*="skeleton"], ' +
      '.jobs-description__content .artdeco-loader'
    )
    if (!skeleton) break
    await wait(300)
  }
  // Extra buffer after skeleton clears
  await wait(400)
}

/**
 * Click LinkedIn's "Show more" / "See more" button in the job description
 * so the full JD text is rendered before we extract it.
 */
async function clickShowMore(): Promise<void> {
  const btn = document.querySelector<HTMLButtonElement>(
    'button.jobs-description__footer-button, ' +
    'button[aria-label*="more"], ' +
    '.jobs-description__content button'
  )
  if (btn) {
    btn.click()
    await wait(600)
  }
}

/** Try a list of selectors, return the first matching element's text. */
function textFrom(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  return ''
}

// ─── LinkedInAdapter ──────────────────────────────────────────────────────────

export class LinkedInAdapter implements SiteAdapter {
  readonly platformName = 'LinkedIn'

  async extractJobLinks(): Promise<string[]> {
    await scrollToLoadCards()

    // Match both global LinkedIn (/jobs/view/) and InCareer (/incareer/jobs/view/)
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/jobs/view/"], a[href*="/incareer/jobs/view/"]'
      )
    )

    const isInCareer = window.location.hostname.includes('linkedin.cn')
    const seen = new Set<string>()
    const links: string[] = []

    for (const a of anchors) {
      try {
        const url = new URL(a.href, window.location.origin)
        // Match /jobs/view/ID or /incareer/jobs/view/ID
        const match = url.pathname.match(/\/(?:incareer\/)?jobs\/view\/(\d+)/)
        if (!match) continue
        // Keep canonical URL on the same domain the user is on
        const canonical = isInCareer
          ? `https://www.linkedin.cn/incareer/jobs/view/${match[1]}/`
          : `https://www.linkedin.com/jobs/view/${match[1]}/`
        if (!seen.has(canonical)) {
          seen.add(canonical)
          links.push(canonical)
        }
      } catch {
        // Malformed href — skip
      }
    }

    return links
  }

  async extractJobDetailText(): Promise<string> {
    // Wait for skeleton loaders to clear, then expand the full description
    await waitForJDLoad()
    await clickShowMore()

    const parts: string[] = []

    // Title — global LinkedIn + InCareer (linkedin.cn) selectors
    const title = textFrom(
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title',
      '.incareer-job-top-card__job-title',
      'h1.topcard__title',
      'h1',
    )
    if (title) parts.push(`Title: ${title}`)

    // Company
    const company = textFrom(
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__company-name',
      '.incareer-job-top-card__company-name',
      '.topcard__org-name-link',
      'a[href*="/company/"]',
    )
    if (company) parts.push(`Company: ${company}`)

    // Location
    const location = textFrom(
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__workplace-type',
      '.incareer-job-top-card__bullet',
      '.topcard__flavor--bullet',
    )
    if (location) parts.push(`Location: ${location}`)

    // Salary
    const salary = textFrom(
      '.jobs-unified-top-card__job-insight--highlight',
      '.compensation__salary',
      '.incareer-job-top-card__salary',
    )
    if (salary) parts.push(`Salary: ${salary}`)

    // Job description body
    const descEl = document.querySelector(
      '.jobs-description-content__text, .jobs-description__content, ' +
      '#job-details, .jobs-box__html-content, ' +
      '.incareer-job-description__content, .job-description-content'
    )
    if (descEl) {
      parts.push(`\nJob Description:\n${(descEl as HTMLElement).innerText.trim()}`)
    } else {
      // Fallback: grab the main content area
      const main = document.querySelector('main, .scaffold-layout__detail')
      if (main) parts.push(`\nPage Content:\n${(main as HTMLElement).innerText.trim()}`)
    }

    return parts.join('\n')
  }

}
