import { describe, it, expect } from 'vitest'
import { DEFAULT_TASK_STATE, DEFAULT_USER_CONFIG } from '../src/shared/types'
import type { TaskState, UserConfig, JobData, MessageType } from '../src/shared/types'

// ─── DEFAULT_TASK_STATE ────────────────────────────────────────────────────

describe('DEFAULT_TASK_STATE', () => {
  it('should have status "idle"', () => {
    expect(DEFAULT_TASK_STATE.status).toBe('idle')
  })

  it('should have target of 50', () => {
    expect(DEFAULT_TASK_STATE.target).toBe(50)
  })

  it('should start with collected = 0', () => {
    expect(DEFAULT_TASK_STATE.collected).toBe(0)
  })

  it('should have empty visitedUrls array', () => {
    expect(DEFAULT_TASK_STATE.visitedUrls).toEqual([])
  })

  it('should have empty pendingLinks array', () => {
    expect(DEFAULT_TASK_STATE.pendingLinks).toEqual([])
  })

  it('should start at keyword index 0', () => {
    expect(DEFAULT_TASK_STATE.currentKeywordIndex).toBe(0)
  })

  it('should start at page 1', () => {
    expect(DEFAULT_TASK_STATE.currentPage).toBe(1)
  })

  it('should have maxPagesPerKeyword of 10', () => {
    expect(DEFAULT_TASK_STATE.maxPagesPerKeyword).toBe(10)
  })

  it('should have consecutiveDupes = 0', () => {
    expect(DEFAULT_TASK_STATE.consecutiveDupes).toBe(0)
  })

  it('should start at platform index 0', () => {
    expect(DEFAULT_TASK_STATE.currentPlatformIndex).toBe(0)
  })

  it('should have activeTabId as null', () => {
    expect(DEFAULT_TASK_STATE.activeTabId).toBeNull()
  })

  it('should have empty savedJobKeys array', () => {
    expect(DEFAULT_TASK_STATE.savedJobKeys).toEqual([])
  })

  it('should have all 3 platforms selected by default', () => {
    expect(DEFAULT_TASK_STATE.selectedPlatformIndices).toEqual([0, 1, 2])
  })

  it('should have all required TaskState fields', () => {
    const required: (keyof TaskState)[] = [
      'status', 'target', 'collected', 'visitedUrls', 'pendingLinks',
      'currentKeywordIndex', 'currentPage', 'pagesPerKeyword',
      'maxPagesPerKeyword', 'consecutiveDupes', 'currentPlatformIndex',
      'activeTabId', 'savedJobKeys', 'selectedPlatformIndices', 'lastUpdated',
    ]
    for (const field of required) {
      expect(DEFAULT_TASK_STATE).toHaveProperty(field)
    }
  })
})

// ─── DEFAULT_USER_CONFIG ───────────────────────────────────────────────────

describe('DEFAULT_USER_CONFIG', () => {
  it('should have empty apiKey', () => {
    expect(DEFAULT_USER_CONFIG.apiKey).toBe('')
  })

  it('should default to OpenAI base URL', () => {
    expect(DEFAULT_USER_CONFIG.apiBaseUrl).toBe('https://api.openai.com/v1')
  })

  it('should default to gpt-4o-mini model', () => {
    expect(DEFAULT_USER_CONFIG.model).toBe('gpt-4o-mini')
  })

  it('should have a non-empty targetRole', () => {
    expect(DEFAULT_USER_CONFIG.targetRole.trim().length).toBeGreaterThan(0)
  })

  it('should have all required UserConfig fields', () => {
    const required: (keyof UserConfig)[] = ['apiKey', 'apiBaseUrl', 'model', 'targetRole']
    for (const field of required) {
      expect(DEFAULT_USER_CONFIG).toHaveProperty(field)
    }
  })
})

// ─── JobData shape ─────────────────────────────────────────────────────────

describe('JobData type contract', () => {
  it('should accept a valid JobData object', () => {
    const job: JobData = {
      title: 'AI Engineer',
      company: 'Test Co',
      location: 'Beijing',
      salary: '30K/month',
      tech_tags: ['LLM', 'PyTorch'],
      requirements: 'Python proficiency required.',
      source: 'LinkedIn',
      job_url: 'https://www.linkedin.com/jobs/view/1/',
    }
    expect(job.title).toBe('AI Engineer')
    expect(Array.isArray(job.tech_tags)).toBe(true)
    expect(job.salary).toBe('30K/month')
  })

  it('should allow empty salary string', () => {
    const job: JobData = {
      title: 'ML Intern', company: 'X', location: 'Y', salary: '',
      tech_tags: ['ML'], requirements: 'req', source: 'Indeed',
      job_url: 'https://indeed.com/viewjob?jk=1',
    }
    expect(job.salary).toBe('')
  })
})

// ─── MessageType exhaustiveness ────────────────────────────────────────────

describe('MessageType completeness', () => {
  it('should include all expected message types', () => {
    const expectedTypes: MessageType[] = [
      'START_TASK', 'STOP_TASK', 'GET_STATE', 'EXPORT_CSV', 'RESET_DATA',
      'EXTRACT_LINKS', 'EXTRACT_JD_TEXT',
      'LINKS_RESULT', 'JD_TEXT_RESULT', 'CONTENT_READY',
    ]
    // TypeScript ensures these compile — if any type is removed, this file won't build
    expect(expectedTypes).toHaveLength(10)
  })
})
