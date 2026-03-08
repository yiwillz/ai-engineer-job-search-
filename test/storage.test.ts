import { describe, it, expect, vi } from 'vitest'
import { getTaskState, updateTaskState, resetTaskState } from '../src/shared/storageUtils'
import { DEFAULT_TASK_STATE } from '../src/shared/types'

// idb is mocked — IndexedDB not available in jsdom
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.resolve({
    put: vi.fn(),
    getAll: vi.fn(() => []),
    count: vi.fn(() => 0),
    clear: vi.fn(),
  })),
}))

// ─── TaskState persistence ─────────────────────────────────────────────────

describe('getTaskState', () => {
  it('should return DEFAULT_TASK_STATE when storage is empty', async () => {
    const state = await getTaskState()
    expect(state.status).toBe('idle')
    expect(state.collected).toBe(0)
    expect(state.target).toBe(50)
  })

  it('should merge stored data with DEFAULT_TASK_STATE', async () => {
    // Simulate partial stored state (e.g., old version missing new fields)
    chrome.storage.local.get = vi.fn(() =>
      Promise.resolve({ taskState: { status: 'searching', collected: 10 } })
    )
    const state = await getTaskState()
    expect(state.status).toBe('searching')
    expect(state.collected).toBe(10)
    // New fields from DEFAULT should be filled in
    expect(state.selectedPlatformIndices).toEqual([0, 1, 2])
    expect(state.maxPagesPerKeyword).toBe(10)
  })

  it('should not throw if storage returns undefined', async () => {
    chrome.storage.local.get = vi.fn(() => Promise.resolve({}))
    await expect(getTaskState()).resolves.toBeDefined()
  })
})

describe('updateTaskState', () => {
  it('should merge partial update into current state', async () => {
    chrome.storage.local.get = vi.fn(() =>
      Promise.resolve({ taskState: { ...DEFAULT_TASK_STATE } })
    )
    const updated = await updateTaskState({ collected: 5, status: 'visiting_detail' })
    expect(updated.collected).toBe(5)
    expect(updated.status).toBe('visiting_detail')
    // Other fields unchanged
    expect(updated.target).toBe(50)
  })

  it('should update lastUpdated timestamp', async () => {
    chrome.storage.local.get = vi.fn(() =>
      Promise.resolve({ taskState: { ...DEFAULT_TASK_STATE, lastUpdated: 0 } })
    )
    const before = Date.now()
    const updated = await updateTaskState({ collected: 1 })
    expect(updated.lastUpdated).toBeGreaterThanOrEqual(before)
  })

  it('should call chrome.storage.local.set', async () => {
    chrome.storage.local.get = vi.fn(() =>
      Promise.resolve({ taskState: { ...DEFAULT_TASK_STATE } })
    )
    await updateTaskState({ status: 'analysing' })
    expect(chrome.storage.local.set).toHaveBeenCalled()
  })
})

describe('resetTaskState', () => {
  it('should reset to DEFAULT_TASK_STATE values', async () => {
    await resetTaskState()
    const [[arg]] = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls as [[Record<string, unknown>]][]
    const saved = arg['taskState'] as typeof DEFAULT_TASK_STATE
    expect(saved.status).toBe('idle')
    expect(saved.collected).toBe(0)
    expect(saved.visitedUrls).toEqual([])
    expect(saved.pendingLinks).toEqual([])
  })
})
