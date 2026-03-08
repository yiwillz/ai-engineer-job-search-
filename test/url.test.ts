import { describe, it, expect } from 'vitest'

// ─── Replicate platform URL builders from agentOrchestrator.ts ────────────
// These functions are defined inline in PLATFORMS — tested here by replication
// to verify the search parameters are correctly constructed.

function linkedInUrl(keyword: string, page: number): string {
  const encoded = encodeURIComponent(keyword)
  const start = (page - 1) * 25
  return `https://www.linkedin.com/jobs/search/?keywords=${encoded}&f_E=1%2C2&f_TPR=r7776000&start=${start}`
}

function indeedUrl(keyword: string, page: number): string {
  const encoded = encodeURIComponent(keyword)
  const start = (page - 1) * 10
  return `https://www.indeed.com/jobs?q=${encoded}&fromage=90&start=${start}`
}

function bossUrl(keyword: string, page: number): string {
  const encoded = encodeURIComponent(keyword)
  return `https://www.zhipin.com/web/geek/job?query=${encoded}&city=100010000&publishTime=3&experience=101%2C102&page=${page}`
}

// ─── LinkedIn URL tests ────────────────────────────────────────────────────

describe('LinkedIn URL builder', () => {
  it('should use correct base URL', () => {
    expect(linkedInUrl('AI Engineer', 1)).toContain('linkedin.com/jobs/search/')
  })

  it('should URL-encode the keyword', () => {
    const url = linkedInUrl('AI Engineer intern', 1)
    expect(url).toContain('AI%20Engineer%20intern')
    expect(url).not.toContain(' ')
  })

  it('should apply experience filter (internship + entry level)', () => {
    // f_E=1%2C2 → f_E=1,2
    expect(linkedInUrl('ML Engineer', 1)).toContain('f_E=1%2C2')
  })

  it('should apply 90-day time filter', () => {
    // f_TPR=r7776000 = 7776000 seconds = 90 days
    expect(linkedInUrl('ML Engineer', 1)).toContain('f_TPR=r7776000')
  })

  it('should paginate: page 1 → start=0', () => {
    expect(linkedInUrl('keyword', 1)).toContain('start=0')
  })

  it('should paginate: page 2 → start=25', () => {
    expect(linkedInUrl('keyword', 2)).toContain('start=25')
  })

  it('should paginate: page 3 → start=50', () => {
    expect(linkedInUrl('keyword', 3)).toContain('start=50')
  })
})

// ─── Indeed URL tests ──────────────────────────────────────────────────────

describe('Indeed URL builder', () => {
  it('should use correct base URL', () => {
    expect(indeedUrl('AI Engineer', 1)).toContain('indeed.com/jobs')
  })

  it('should URL-encode the keyword', () => {
    const url = indeedUrl('NLP Engineer intern', 1)
    expect(url).toContain('NLP%20Engineer%20intern')
  })

  it('should apply 90-day filter (fromage=90)', () => {
    expect(indeedUrl('ML Engineer', 1)).toContain('fromage=90')
  })

  it('should paginate: page 1 → start=0', () => {
    expect(indeedUrl('keyword', 1)).toContain('start=0')
  })

  it('should paginate: page 2 → start=10', () => {
    expect(indeedUrl('keyword', 2)).toContain('start=10')
  })

  it('should paginate: page 4 → start=30', () => {
    expect(indeedUrl('keyword', 4)).toContain('start=30')
  })
})

// ─── Boss直聘 URL tests ────────────────────────────────────────────────────

describe('Boss直聘 URL builder', () => {
  it('should use correct base URL', () => {
    expect(bossUrl('AI工程师 校招', 1)).toContain('zhipin.com/web/geek/job')
  })

  it('should URL-encode Chinese keyword', () => {
    const url = bossUrl('AI工程师 校招', 1)
    expect(url).not.toContain('AI工程师 校招') // raw Chinese+space should be encoded
  })

  it('should target nationwide city (city=100010000)', () => {
    expect(bossUrl('AI工程师', 1)).toContain('city=100010000')
  })

  it('should filter by publish time within 1 month (publishTime=3)', () => {
    expect(bossUrl('AI工程师', 1)).toContain('publishTime=3')
  })

  it('should include experience filter for graduates (experience=101,102)', () => {
    // experience=101%2C102 → 101,102 (在校生 + 应届生)
    expect(bossUrl('AI工程师', 1)).toContain('experience=101%2C102')
  })

  it('should use page param directly (not start offset)', () => {
    expect(bossUrl('keyword', 1)).toContain('page=1')
    expect(bossUrl('keyword', 3)).toContain('page=3')
  })

  it('should not include a "start" offset param like LinkedIn/Indeed', () => {
    expect(bossUrl('keyword', 2)).not.toContain('start=')
  })
})

// ─── Cross-platform pagination comparison ─────────────────────────────────

describe('Platform pagination differences', () => {
  it('LinkedIn page size is 25 (start jumps by 25)', () => {
    const p1 = new URL(linkedInUrl('kw', 1))
    const p2 = new URL(linkedInUrl('kw', 2))
    const start1 = Number(p1.searchParams.get('start'))
    const start2 = Number(p2.searchParams.get('start'))
    expect(start2 - start1).toBe(25)
  })

  it('Indeed page size is 10 (start jumps by 10)', () => {
    const p1 = new URL(indeedUrl('kw', 1))
    const p2 = new URL(indeedUrl('kw', 2))
    const start1 = Number(p1.searchParams.get('start'))
    const start2 = Number(p2.searchParams.get('start'))
    expect(start2 - start1).toBe(10)
  })
})
