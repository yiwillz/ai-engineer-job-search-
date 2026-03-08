import type { SiteAdapter } from './SiteAdapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function scrollToLoadCards(): Promise<void> {
  window.scrollTo(0, document.body.scrollHeight)
  await wait(1000)
  window.scrollTo(0, 0)
  await wait(400)
}

function textFrom(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  return ''
}

// ─── IndeedAdapter ────────────────────────────────────────────────────────────

export class IndeedAdapter implements SiteAdapter {
  readonly platformName = 'Indeed'

  async extractJobLinks(): Promise<string[]> {
    await scrollToLoadCards()

    const seen = new Set<string>()
    const links: string[] = []

    // Indeed job result cards — multiple selector strategies
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a.jcs-JobTitle, a[data-jk], h2.jobTitle a, .job_seen_beacon a[href*="/rc/clk"], a[href*="/pagead/clk"]'
      )
    )

    for (const a of anchors) {
      try {
        const href = a.getAttribute('href') ?? ''
        if (!href) continue

        const url = new URL(href, 'https://www.indeed.com')

        // Extract the job key (jk param) for canonical dedup
        const jk = url.searchParams.get('jk')
        if (jk) {
          const canonical = `https://www.indeed.com/viewjob?jk=${jk}`
          if (!seen.has(canonical)) {
            seen.add(canonical)
            links.push(canonical)
          }
        } else if (href.includes('/viewjob') || href.includes('/rc/clk')) {
          const canonical = url.href
          if (!seen.has(canonical)) {
            seen.add(canonical)
            links.push(canonical)
          }
        }
      } catch {
        // Malformed href — skip
      }
    }

    return links
  }

  async extractJobDetailText(): Promise<string> {
    await wait(800)

    const parts: string[] = []

    // Title
    const title = textFrom(
      'h1.jobsearch-JobInfoHeader-title',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      'h1',
    )
    if (title) parts.push(`Title: ${title}`)

    // Company
    const company = textFrom(
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating-companyHeader a',
      '.css-hon9z8',
    )
    if (company) parts.push(`Company: ${company}`)

    // Location
    const location = textFrom(
      '[data-testid="job-location"]',
      '.jobsearch-JobInfoHeader-subtitle > div:last-child',
      '.css-6z8o9s',
    )
    if (location) parts.push(`Location: ${location}`)

    // Salary
    const salary = textFrom(
      '[data-testid="attribute_snippet_testid"]',
      '#salaryInfoAndJobType',
      '.css-19j1a75',
    )
    if (salary) parts.push(`Salary: ${salary}`)

    // Job description
    const descEl = document.querySelector(
      '#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]'
    )
    if (descEl) {
      parts.push(`\nJob Description:\n${(descEl as HTMLElement).innerText.trim()}`)
    } else {
      const main = document.querySelector('main, #jobsearch-ViewjobPaneWrapper')
      if (main) parts.push(`\nPage Content:\n${(main as HTMLElement).innerText.trim()}`)
    }

    return parts.join('\n')
  }

}
