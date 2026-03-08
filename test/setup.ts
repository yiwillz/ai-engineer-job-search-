// ─── Chrome Extension API Mocks ───────────────────────────────────────────────
// Vitest runs in jsdom — Chrome extension globals do not exist by default.

import { vi } from 'vitest'

const storageMock: Record<string, unknown> = {}

// @ts-expect-error — global chrome stub
global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[], callback?: (result: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {}
        const keyList = Array.isArray(keys) ? keys : [keys]
        for (const k of keyList) result[k] = storageMock[k]
        if (callback) callback(result)
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(storageMock, items)
        return Promise.resolve()
      }),
    },
  },
  downloads: {
    download: vi.fn(() => Promise.resolve(1)),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
  },
  tabs: {
    update: vi.fn(),
    get: vi.fn(),
    sendMessage: vi.fn(),
  },
}

// Reset storage mock between tests
beforeEach(() => {
  for (const key in storageMock) delete storageMock[key]
  vi.clearAllMocks()
})
