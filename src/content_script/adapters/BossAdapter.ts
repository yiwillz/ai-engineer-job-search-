import type { SiteAdapter } from './SiteAdapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Boss直聘 is a SPA — scroll the job-list container to trigger lazy loading. */
async function scrollToLoadCards(): Promise<void> {
  // The job list scrolls inside its own container, not the window
  const container = document.querySelector(
    '.job-list-box, .search-job-result, .job-tab-list'
  ) as HTMLElement | null
  if (container) {
    container.scrollTop = container.scrollHeight
    await wait(1500)
    container.scrollTop = 0
  } else {
    window.scrollTo(0, document.body.scrollHeight)
    await wait(1500)
    window.scrollTo(0, 0)
  }
  await wait(600)
}

/** Wait until at least one job-detail link appears in the DOM. */
async function waitForJobCards(): Promise<void> {
  const maxWait = 8000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    if (document.querySelector('a[href*="/job_detail/"]')) break
    await wait(400)
  }
  await wait(300)
}

/** Wait for skeleton loaders to disappear on detail pages. */
async function waitForContentLoad(): Promise<void> {
  const maxWait = 6000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const skeleton = document.querySelector(
      '.skeleton, .loading-skeleton, [class*="skeleton"], .loading'
    )
    if (!skeleton) break
    await wait(300)
  }
  await wait(400)
}

function textFrom(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  return ''
}

// ─── BossAdapter ──────────────────────────────────────────────────────────────

export class BossAdapter implements SiteAdapter {
  readonly platformName = 'Boss直聘'

  async extractJobLinks(): Promise<string[]> {
    await waitForJobCards()   // wait for at least one card before scrolling
    await scrollToLoadCards() // scroll to load any lazy cards

    const seen = new Set<string>()
    const links: string[] = []

    // Broad selector: any anchor linking to a Boss直聘 job detail page
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/job_detail/"]')
    )

    for (const a of anchors) {
      try {
        const href = a.getAttribute('href') ?? ''
        if (!href.includes('/job_detail/')) continue
        const url = new URL(href, 'https://www.zhipin.com')
        const canonical = `https://www.zhipin.com${url.pathname}`
        if (!seen.has(canonical)) {
          seen.add(canonical)
          links.push(canonical)
        }
      } catch {
        // skip malformed
      }
    }

    console.log(`[BossAdapter] Found ${links.length} job links on ${window.location.href}`)
    return links
  }

  async extractJobDetailText(): Promise<string> {
    await waitForContentLoad()

    const parts: string[] = []

    // Title
    const title = textFrom(
      '.job-name',
      '.name.job-name',
      '.position-name',
      'h1',
    )
    if (title) parts.push(`Title: ${title}`)

    // Company
    const company = textFrom(
      '.company-name',
      '.name.company-name',
      '.company-info .name',
      '.job-company a',
    )
    if (company) parts.push(`Company: ${company}`)

    // Location & experience info from top card tags
    const location = textFrom(
      '.location-address',
      '.job-location',
      '.job-area',
      '.location',
    )
    if (location) parts.push(`Location: ${location}`)

    // Salary
    const salary = textFrom(
      '.salary',
      '.job-salary',
      '[class*="salary"]',
    )
    if (salary) parts.push(`Salary: ${salary}`)

    // Experience / education requirements (shows entry-level hints)
    const tags = document.querySelector('.job-tags, .tag-list, .job-condition')
    if (tags) parts.push(`Tags: ${(tags as HTMLElement).innerText.trim()}`)

    // Full job description
    const descEl = document.querySelector(
      '.job-detail-section .job-sec-text, ' +
      '.job-sec-text, ' +
      '.detail-content, ' +
      '.job-detail-info, ' +
      '.job-box .text'
    )
    if (descEl) {
      parts.push(`\nJob Description:\n${(descEl as HTMLElement).innerText.trim()}`)
    } else {
      // Fallback: grab the main content region
      const main = document.querySelector(
        '.job-detail-box, .job-primary-detail, main, #main'
      )
      if (main) parts.push(`\nPage Content:\n${(main as HTMLElement).innerText.trim()}`)
    }

    return parts.join('\n')
  }

}
