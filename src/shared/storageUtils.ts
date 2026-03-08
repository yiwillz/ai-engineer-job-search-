import { openDB, type IDBPDatabase } from 'idb'
import type { JobData, TaskState, UserConfig } from './types'
import { DEFAULT_TASK_STATE, DEFAULT_USER_CONFIG } from './types'

// ─── Keys ─────────────────────────────────────────────────────────────────────

const TASK_STATE_KEY = 'taskState'
const USER_CONFIG_KEY = 'userConfig'

// ─── chrome.storage.local — lightweight TaskState + UserConfig ────────────────

export async function getTaskState(): Promise<TaskState> {
  const result = await chrome.storage.local.get(TASK_STATE_KEY)
  const stored = result[TASK_STATE_KEY] as Partial<TaskState> | undefined
  // Merge with DEFAULT_TASK_STATE so any fields added after initial storage are
  // always present — prevents crashes when schema evolves between extension updates.
  return stored ? { ...DEFAULT_TASK_STATE, ...stored } : { ...DEFAULT_TASK_STATE }
}

export async function setTaskState(state: TaskState): Promise<void> {
  await chrome.storage.local.set({ [TASK_STATE_KEY]: state })
}

export async function updateTaskState(partial: Partial<TaskState>): Promise<TaskState> {
  const current = await getTaskState()
  const updated: TaskState = { ...current, ...partial, lastUpdated: Date.now() }
  await setTaskState(updated)
  return updated
}

export async function resetTaskState(): Promise<void> {
  await chrome.storage.local.set({
    [TASK_STATE_KEY]: { ...DEFAULT_TASK_STATE, lastUpdated: Date.now() },
  })
}

export async function getUserConfig(): Promise<UserConfig> {
  const result = await chrome.storage.local.get(USER_CONFIG_KEY)
  return (result[USER_CONFIG_KEY] as UserConfig) ?? { ...DEFAULT_USER_CONFIG }
}

export async function setUserConfig(config: UserConfig): Promise<void> {
  await chrome.storage.local.set({ [USER_CONFIG_KEY]: config })
}

// ─── IndexedDB — full JobData store (handles large payloads safely) ───────────

const DB_NAME = 'agentic-job-scout'
const DB_VERSION = 1
const JOBS_STORE = 'jobs'

let _db: IDBPDatabase | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(JOBS_STORE)) {
        const store = db.createObjectStore(JOBS_STORE, {
          keyPath: 'job_url',  // unique key = URL, auto-deduplicates on put
        })
        store.createIndex('by_company', 'company', { unique: false })
      }
    },
  })
  return _db
}

export async function saveJob(job: JobData): Promise<void> {
  const db = await getDb()
  await db.put(JOBS_STORE, job)  // put = upsert, deduplication by job_url
}

export async function getAllJobs(): Promise<JobData[]> {
  const db = await getDb()
  return db.getAll(JOBS_STORE)
}

export async function getJobCount(): Promise<number> {
  const db = await getDb()
  return db.count(JOBS_STORE)
}

export async function clearJobs(): Promise<void> {
  const db = await getDb()
  await db.clear(JOBS_STORE)
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

export function jobsToCSV(jobs: JobData[]): string {
  const headers = ['title', 'company', 'location', 'salary', 'tech_tags', 'requirements', 'source', 'job_url']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = jobs.map(j => [
    escape(j.title),
    escape(j.company),
    escape(j.location),
    escape(j.salary),
    escape(j.tech_tags.join('; ')),
    escape(j.requirements),
    escape(j.source),
    escape(j.job_url),
  ].join(','))
  return [headers.join(','), ...rows].join('\n')
}

export async function triggerCSVDownload(): Promise<void> {
  const jobs = await getAllJobs()
  const csv = jobsToCSV(jobs)
  // Use data URL — URL.createObjectURL is not available in MV3 Service Workers
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
  await chrome.downloads.download({
    url: dataUrl,
    filename: `ai_engineer_jobs_${Date.now()}.csv`,
    saveAs: false,
  })
}
