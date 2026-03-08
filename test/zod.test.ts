import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ─── Replicate the LLM response schema from llmClient.ts ──────────────────
// This tests that valid LLM responses pass and malformed ones are rejected,
// matching exactly the schema used in production.

const JobExtractionSchema = z.object({
  is_ai_engineer: z.boolean(),
  is_campus_or_intern: z.boolean(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  salary: z.string(),
  tech_tags: z.array(z.string()),
  requirements: z.string(),
})

// ─── Valid fixtures ────────────────────────────────────────────────────────

const validAIJob = {
  is_ai_engineer: true,
  is_campus_or_intern: true,
  title: 'AI Engineer Intern',
  company: 'ByteDance',
  location: 'Beijing',
  salary: '300/day',
  tech_tags: ['LLM', 'PyTorch', 'RAG'],
  requirements: 'Proficiency in Python and deep learning.',
}

const validNonAIJob = {
  is_ai_engineer: false,
  is_campus_or_intern: false,
  title: 'Backend Engineer',
  company: 'SomeCo',
  location: 'Shanghai',
  salary: '',
  tech_tags: [],
  requirements: '',
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('LLM Response Zod Schema', () => {
  // --- Valid cases ---
  it('should accept a valid AI Engineer job response', () => {
    const result = JobExtractionSchema.safeParse(validAIJob)
    expect(result.success).toBe(true)
  })

  it('should accept a valid non-AI response (both flags false)', () => {
    const result = JobExtractionSchema.safeParse(validNonAIJob)
    expect(result.success).toBe(true)
  })

  it('should accept empty tech_tags array', () => {
    const result = JobExtractionSchema.safeParse({ ...validAIJob, tech_tags: [] })
    expect(result.success).toBe(true)
  })

  it('should accept empty salary string', () => {
    const result = JobExtractionSchema.safeParse({ ...validAIJob, salary: '' })
    expect(result.success).toBe(true)
  })

  // --- Invalid cases ---
  it('should reject response missing is_ai_engineer field', () => {
    const { is_ai_engineer, ...missing } = validAIJob
    void is_ai_engineer
    const result = JobExtractionSchema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('should reject response missing is_campus_or_intern field', () => {
    const { is_campus_or_intern, ...missing } = validAIJob
    void is_campus_or_intern
    const result = JobExtractionSchema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('should reject when is_ai_engineer is a string instead of boolean', () => {
    const result = JobExtractionSchema.safeParse({ ...validAIJob, is_ai_engineer: 'true' })
    expect(result.success).toBe(false)
  })

  it('should reject when tech_tags is a string instead of array', () => {
    const result = JobExtractionSchema.safeParse({ ...validAIJob, tech_tags: 'LLM, PyTorch' })
    expect(result.success).toBe(false)
  })

  it('should reject when tech_tags contains non-string elements', () => {
    const result = JobExtractionSchema.safeParse({ ...validAIJob, tech_tags: [1, 2, 3] })
    expect(result.success).toBe(false)
  })

  it('should reject a null response', () => {
    const result = JobExtractionSchema.safeParse(null)
    expect(result.success).toBe(false)
  })

  it('should reject an empty object', () => {
    const result = JobExtractionSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('should reject when title is missing', () => {
    const { title, ...missing } = validAIJob
    void title
    const result = JobExtractionSchema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  // --- Qualifier logic (mirrors analyseJob logic) ---
  it('qualifier: is_ai_engineer=false should return null (disqualified)', () => {
    const parsed = JobExtractionSchema.safeParse({ ...validAIJob, is_ai_engineer: false })
    if (!parsed.success) throw new Error('Schema failed unexpectedly')
    const qualifies = parsed.data.is_ai_engineer && parsed.data.is_campus_or_intern
    expect(qualifies).toBe(false)
  })

  it('qualifier: is_campus_or_intern=false should return null (disqualified)', () => {
    const parsed = JobExtractionSchema.safeParse({ ...validAIJob, is_campus_or_intern: false })
    if (!parsed.success) throw new Error('Schema failed unexpectedly')
    const qualifies = parsed.data.is_ai_engineer && parsed.data.is_campus_or_intern
    expect(qualifies).toBe(false)
  })

  it('qualifier: both true should qualify', () => {
    const parsed = JobExtractionSchema.safeParse(validAIJob)
    if (!parsed.success) throw new Error('Schema failed unexpectedly')
    const qualifies = parsed.data.is_ai_engineer && parsed.data.is_campus_or_intern
    expect(qualifies).toBe(true)
  })
})
