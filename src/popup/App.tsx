import { useEffect, useRef, useState } from 'react'
import type { TaskState, UserConfig } from '../shared/types'
import { DEFAULT_USER_CONFIG } from '../shared/types'

// ─── Types for chrome.runtime.sendMessage responses ──────────────────────────

interface OkResponse { ok: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { label: 'LinkedIn', index: 0, tip: '需要VPN' },
  { label: 'Indeed', index: 1, tip: '需要VPN' },
  { label: 'Boss直聘', index: 2, tip: '关闭VPN' },
]

const MODELS = [
  { label: 'GPT-4o mini (OpenAI)', value: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
  { label: 'GPT-4o (OpenAI)', value: 'gpt-4o', base: 'https://api.openai.com/v1' },
  { label: 'DeepSeek Chat', value: 'deepseek-chat', base: 'https://api.deepseek.com/v1' },
  { label: 'Custom', value: 'custom', base: '' },
]

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready to start',
  searching: 'Searching job listings...',
  extracting_links: 'Collecting job links...',
  visiting_detail: 'Reading job details...',
  analysing: 'Analysing with AI...',
  done: 'Done! CSV downloaded.',
  error: 'Error occurred',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ collected, target }: { collected: number; target: number }) {
  const pct = Math.min(100, Math.round((collected / target) * 100))
  return (
    <div className="w-full bg-gray-800 rounded-full h-2">
      <div
        className="h-2 rounded-full transition-all duration-500 bg-blue-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'done' ? 'bg-green-500' :
    status === 'error' ? 'bg-red-500' :
    status === 'idle' ? 'bg-gray-500' :
    'bg-blue-500 animate-pulse'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-2`} />
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<UserConfig>(DEFAULT_USER_CONFIG)
  const [taskState, setTaskState] = useState<TaskState | null>(null)
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value)
  const [selectedPlatforms, setSelectedPlatforms] = useState<number[]>([0, 1, 2])
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Load config and initial state on mount ───────────────────────────────

  useEffect(() => {
    chrome.storage.local.get(['userConfig', 'taskState'], (result) => {
      if (result.userConfig) {
        const saved = result.userConfig as UserConfig
        setConfig(saved)
        const match = MODELS.find(m => m.value === saved.model)
        setSelectedModel(match ? match.value : 'custom')
      }
      if (result.taskState) {
        setTaskState(result.taskState as TaskState)
      }
    })
  }, [])

  // ─── Poll task state while agent is running ───────────────────────────────

  useEffect(() => {
    const isRunning = taskState?.status !== 'idle' &&
                      taskState?.status !== 'done' &&
                      taskState?.status !== 'error'

    if (isRunning) {
      pollRef.current = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'GET_STATE' })
          .then((s: TaskState) => setTaskState(s))
          .catch(() => {/* SW may be asleep */})
      }, 1000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [taskState?.status])

  // ─── Config field handlers ────────────────────────────────────────────────

  function handleModelChange(value: string) {
    setSelectedModel(value)
    const preset = MODELS.find(m => m.value === value)
    if (preset && value !== 'custom') {
      setConfig(c => ({ ...c, model: value, apiBaseUrl: preset.base }))
    }
  }

  async function saveConfig() {
    setSaving(true)
    await chrome.storage.local.set({ userConfig: config })
    setSaving(false)
  }

  // ─── Agent controls ───────────────────────────────────────────────────────

  async function handleStart() {
    if (selectedPlatforms.length === 0) return

    // Optimistic update — show Stop button immediately so the user knows it started
    setTaskState(s => s ? { ...s, status: 'searching' } : { ...DEFAULT_TASK_STATE, status: 'searching' } as TaskState)

    await saveConfig()

    // Query active tab — use lastFocusedWindow to avoid returning the popup's own window
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const tab = tabs[0]
    if (!tab?.id) {
      // Revert optimistic update if we can't find a tab
      setTaskState(s => s ? { ...s, status: 'idle' } : null)
      return
    }

    chrome.runtime.sendMessage({
      type: 'START_TASK',
      payload: { tabId: tab.id, selectedPlatformIndices: selectedPlatforms },
    }).catch(() => {/* SW waking up — message will still be processed */})
  }

  function togglePlatform(index: number) {
    setSelectedPlatforms(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].sort()
    )
  }

  async function handleStop() {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_TASK' })
    } catch {
      // SW may be sleeping — state is already updated locally below
    }
    setTaskState(s => s ? { ...s, status: 'idle' } : null)
  }

  async function handleExport() {
    await chrome.runtime.sendMessage({ type: 'EXPORT_CSV' })
  }

  async function handleReset() {
    await chrome.runtime.sendMessage({ type: 'RESET_DATA' })
    setTaskState(null)
  }

  // ─── Derived state ────────────────────────────────────────────────────────

  const status = taskState?.status ?? 'idle'
  const collected = taskState?.collected ?? 0
  const target = taskState?.target ?? 50
  const isRunning = !['idle', 'done', 'error'].includes(status)
  const canStart = config.apiKey.trim().length > 0 && !isRunning && selectedPlatforms.length > 0
  const isDone = status === 'done' || collected >= target
  const hasProgress = collected > 0 || (taskState?.visitedUrls?.length ?? 0) > 0
  const startLabel = saving ? 'Saving...' : (hasProgress && !isDone ? 'Resume' : 'Start Agent')

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold">
          AI
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-none">Agentic Job Scout</h1>
          <p className="text-xs text-gray-500 mt-0.5">AI Engineer campus job collector</p>
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* Config section */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Configuration</p>

        {/* Model selector */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Model</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            value={selectedModel}
            onChange={e => handleModelChange(e.target.value)}
            disabled={isRunning}
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Custom base URL (shown for custom model) */}
        {selectedModel === 'custom' && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">API Base URL</label>
            <input
              type="text"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="https://api.openai.com/v1"
              value={config.apiBaseUrl}
              onChange={e => setConfig(c => ({ ...c, apiBaseUrl: e.target.value }))}
              disabled={isRunning}
            />
          </div>
        )}

        {/* API Key */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm pr-10 focus:outline-none focus:border-blue-500"
              placeholder="sk-..."
              value={config.apiKey}
              onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
              disabled={isRunning}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
              onClick={() => setShowKey(v => !v)}
              tabIndex={-1}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Target role */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Target Role</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            value={config.targetRole}
            onChange={e => setConfig(c => ({ ...c, targetRole: e.target.value }))}
            disabled={isRunning}
          />
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* Platform selection */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Search Platforms</p>
        <div className="flex gap-3">
          {PLATFORMS.map(p => (
            <label key={p.index} className={`flex flex-col cursor-pointer ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <span className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={selectedPlatforms.includes(p.index)}
                  onChange={() => !isRunning && togglePlatform(p.index)}
                  disabled={isRunning}
                />
                {p.label}
              </span>
              <span className="text-xs text-gray-500 ml-5">{p.tip}</span>
            </label>
          ))}
        </div>
        {selectedPlatforms.length === 0 && (
          <p className="text-xs text-yellow-500">Select at least one platform</p>
        )}
      </div>

      <hr className="border-gray-800" />

      {/* Progress section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Progress</span>
          <span className="text-xs font-mono text-gray-300">{collected} / {target}</span>
        </div>
        <ProgressBar collected={collected} target={target} />
        <div className="flex items-center text-xs text-gray-400">
          <StatusDot status={status} />
          {STATUS_LABELS[status] ?? status}
        </div>
        {taskState?.errorMessage && (
          <p className="text-xs text-red-400 bg-red-950 rounded p-2">{taskState.errorMessage}</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded py-2 text-sm font-medium transition-colors"
            onClick={handleStart}
            disabled={!canStart}
          >
            {startLabel}
          </button>
        ) : (
          <button
            className="flex-1 bg-red-700 hover:bg-red-600 rounded py-2 text-sm font-medium transition-colors"
            onClick={handleStop}
          >
            Stop
          </button>
        )}

        {(status === 'done' || collected > 0) && (
          <button
            className="px-3 bg-green-700 hover:bg-green-600 rounded py-2 text-sm font-medium transition-colors"
            onClick={handleExport}
            title="Export CSV"
          >
            CSV
          </button>
        )}

        {!isRunning && (
          <button
            className="px-3 bg-gray-700 hover:bg-gray-600 rounded py-2 text-sm font-medium transition-colors"
            onClick={handleReset}
            title="清空数据库，重新开始"
          >
            重置
          </button>
        )}
      </div>

      {!config.apiKey.trim() && (
        <p className="text-xs text-yellow-500 text-center">Enter an API key to enable the agent</p>
      )}
    </div>
  )
}
