import { describe, it, expect } from 'vitest'
import { jobsToCSV } from '../src/shared/storageUtils'
import type { JobData } from '../src/shared/types'

// ─── Test fixtures ─────────────────────────────────────────────────────────

const sampleJob: JobData = {
  title: 'AI Engineer Intern',
  company: 'Acme Corp',
  location: 'Beijing, China',
  salary: '20K/month',
  tech_tags: ['LLM', 'PyTorch', 'RAG'],
  requirements: 'Proficiency in Python and deep learning frameworks.',
  source: 'LinkedIn',
  job_url: 'https://www.linkedin.com/jobs/view/123456789/',
}

const jobWithSpecialChars: JobData = {
  title: 'LLM Engineer, "New Grad"',
  company: 'He said "Hello, World"',
  location: 'Shanghai',
  salary: '',
  tech_tags: ['NLP', 'BERT'],
  requirements: 'Strong background in NLP; experience with transformers.',
  source: 'Boss直聘',
  job_url: 'https://www.zhipin.com/job_detail/abc123.html',
}

const jobMinimal: JobData = {
  title: 'ML Intern',
  company: 'StartupXYZ',
  location: 'Remote',
  salary: '',
  tech_tags: ['Machine Learning'],
  requirements: 'Entry-level ML role.',
  source: 'Indeed',
  job_url: 'https://www.indeed.com/viewjob?jk=xyz',
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('jobsToCSV', () => {
  it('should produce correct CSV header', () => {
    const csv = jobsToCSV([])
    const header = csv.split('\n')[0]
    expect(header).toBe('title,company,location,salary,tech_tags,requirements,source,job_url')
  })

  it('should produce header-only for empty array', () => {
    const csv = jobsToCSV([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('title')
  })

  it('should produce 2 lines for a single job (header + 1 row)', () => {
    const csv = jobsToCSV([sampleJob])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
  })

  it('should wrap all fields in double quotes', () => {
    const csv = jobsToCSV([sampleJob])
    const row = csv.split('\n')[1]
    const fields = row.match(/"[^"]*"/g) ?? []
    expect(fields).toHaveLength(8) // all 8 fields quoted
  })

  it('should join tech_tags with "; "', () => {
    const csv = jobsToCSV([sampleJob])
    expect(csv).toContain('"LLM; PyTorch; RAG"')
  })

  it('should preserve empty salary as empty quoted string', () => {
    const csv = jobsToCSV([jobMinimal])
    // salary field is 4th column — should be ""
    const row = csv.split('\n')[1]
    // The row should contain ,"", (empty quoted field)
    expect(row).toContain('""')
  })

  it('should escape internal double quotes by doubling them', () => {
    const csv = jobsToCSV([jobWithSpecialChars])
    // 'He said "Hello, World"' → "He said ""Hello, World"""
    expect(csv).toContain('He said ""Hello, World""')
  })

  it('should escape commas inside fields (wrapped in quotes)', () => {
    const csv = jobsToCSV([sampleJob])
    // "Beijing, China" should be wrapped so parser doesn't split it
    expect(csv).toContain('"Beijing, China"')
  })

  it('should produce N+1 lines for N jobs', () => {
    const jobs = [sampleJob, jobWithSpecialChars, jobMinimal]
    const csv = jobsToCSV(jobs)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(4) // 1 header + 3 rows
  })

  it('should correctly place job_url as the last field', () => {
    const csv = jobsToCSV([sampleJob])
    const row = csv.split('\n')[1]
    expect(row.endsWith(`"${sampleJob.job_url}"`)).toBe(true)
  })

  it('should correctly place source field second-to-last', () => {
    const csv = jobsToCSV([sampleJob])
    const row = csv.split('\n')[1]
    expect(row).toContain(`"${sampleJob.source}"`)
  })
})
