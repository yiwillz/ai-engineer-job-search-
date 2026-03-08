import { z } from 'zod'
import type { JobData, UserConfig } from '../shared/types'

// ─── Zod schema for LLM response ─────────────────────────────────────────────

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

type JobExtraction = z.infer<typeof JobExtractionSchema>

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a job analysis assistant for a fresh graduate looking for AI Engineer roles.

Given raw job posting text, you must:
1. Judge whether this is a genuine AI / ML / LLM / Algorithm engineering position.
   - TRUE for: AI Engineer, ML Engineer, LLM Engineer, Machine Learning Engineer, Algorithm Engineer, Applied Scientist, AI Research Engineer, NLP Engineer, CV Engineer, Data Scientist (ML-focused), MLOps Engineer, AI Platform Engineer, AI Agent Engineer, and similar roles whose PRIMARY duty is building / training / deploying AI or ML systems.
   - FALSE for:
     * Generic Software Engineer, Backend Engineer, Frontend Engineer, Data Engineer, Big Data Engineer even if the product is AI-related (Hadoop/Spark/Kafka pipelines are NOT AI engineering)
     * AI Test Engineer / QA Engineer / SDET — testing AI systems is not building them
     * AI Artist / AIGC Designer / AI Image Generator / 生图师 — creative/design roles are not engineering
     * DevOps, SRE, Operations Engineer, 运维工程师 even if "AI-powered"
     * Product Manager, Business Analyst, Sales, Marketing
     * Any role where AI/ML is only a minor tool rather than the core responsibility

2. Judge whether it targets entry-level candidates (is_campus_or_intern).
   - TRUE for ANY of: intern, internship, co-op, campus recruit, new graduate, new grad, university graduate, college graduate, recent graduate, early career, entry level, entry-level, 0-2 years experience, 校招, 应届, 实习, 2025/2026 graduate, "New College Grad", "University Grad", or similar.
   - Be GENEROUS: if the job description mentions it is designed for students or people just starting their careers, set this to true.
   - FALSE only if the role CLEARLY requires 3+ years of experience with NO intern/new-grad track mentioned.

3. If both conditions are true, extract structured information.

Respond ONLY with a valid JSON object — no markdown, no explanation:
{
  "is_ai_engineer": boolean,
  "is_campus_or_intern": boolean,
  "title": string,
  "company": string,
  "location": string,
  "salary": string,
  "tech_tags": string[],
  "requirements": string
}

Rules:
- tech_tags: MUST always be a non-empty array. Extract explicit keywords (LLM, NLP, CV, RAG, PyTorch, RLHF, TensorFlow, etc.). If the JD has no specific tech stack, infer from the job title — e.g. "ML Engineer" → ["Machine Learning"], "AI Engineer" → ["AI", "Machine Learning"]. Never return [].
- requirements: MUST always be a non-empty string. Summarise the core skills in 1-2 sentences. If details are sparse, write a reasonable inference based on the job title, e.g. "Entry-level AI/ML engineering role requiring foundational knowledge in machine learning and software development." Never return "".
- salary: extract if present, otherwise empty string
- If is_ai_engineer or is_campus_or_intern is false, other fields may be empty strings / empty arrays`

function buildUserPrompt(text: string, url: string): string {
  // Truncate to ~5000 chars — enough for a full JD without exceeding token limits
  const truncated = text.length > 5000 ? text.slice(0, 5000) + '...' : text
  return `Job URL: ${url}\n\nJob Description:\n${truncated}`
}

// ─── LLM call with exponential backoff retry ──────────────────────────────────

async function callLLMRaw(
  userPrompt: string,
  config: UserConfig,
  attempt: number,
): Promise<string> {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  try {
    const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM API error ${response.status}: ${await response.text()}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0].message.content
  } catch (err) {
    if (attempt < 3) {
      await delay(1000 * Math.pow(2, attempt)) // 1s, 2s, 4s
      return callLLMRaw(userPrompt, config, attempt + 1)
    }
    throw err
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a raw JD text. Returns a JobData object if the job qualifies,
 * or null if it's not an AI Engineer campus/intern role.
 */
export async function analyseJob(
  rawText: string,
  jobUrl: string,
  platformName: string,
  config: UserConfig,
): Promise<JobData | null> {
  const userPrompt = buildUserPrompt(rawText, jobUrl)
  let rawJson: string

  try {
    rawJson = await callLLMRaw(userPrompt, config, 0)
  } catch (err) {
    console.error('[llmClient] LLM call failed after retries:', err)
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    console.warn('[llmClient] LLM returned non-JSON:', rawJson)
    return null
  }

  const result = JobExtractionSchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[llmClient] Zod validation failed:', result.error.flatten())
    return null
  }

  const extraction: JobExtraction = result.data

  if (!extraction.is_ai_engineer || !extraction.is_campus_or_intern) {
    return null // Does not qualify
  }

  return {
    title: extraction.title,
    company: extraction.company,
    location: extraction.location,
    salary: extraction.salary,
    tech_tags: extraction.tech_tags,
    requirements: extraction.requirements,
    source: platformName,
    job_url: jobUrl,
  }
}
