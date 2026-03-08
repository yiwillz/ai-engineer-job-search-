import {
  getTaskState,
  updateTaskState,
  resetTaskState,
  getUserConfig,
  saveJob,
  clearJobs,
  triggerCSVDownload,
} from '../shared/storageUtils'
import type { TaskState, Message, LinksResultPayload, JdTextResultPayload } from '../shared/types'
import { analyseJob } from './llmClient'

// ─── Platform configuration (per-platform keywords + URL builders) ───────────
// Date filter: all platforms restrict to jobs posted in the last 3 months.

const PLATFORMS = [
  {
    name: 'LinkedIn',
    hostname: 'www.linkedin.com',
    keywords: [
      // AI / LLM
      'AI Engineer intern',
      'AI Engineer new graduate',
      'LLM Engineer intern',
      'LLM Engineer new grad',
      'Generative AI Engineer intern',
      'AIGC Engineer new grad',
      // Machine Learning
      'Machine Learning Engineer intern',
      'Machine Learning Engineer new college grad',
      'ML Engineer entry level',
      'Applied ML Engineer intern',
      // Deep Learning / CV / NLP
      'Deep Learning Engineer intern',
      'NLP Engineer intern',
      'Computer Vision Engineer intern',
      'CV Engineer new grad',
      // Algorithm / Data Intelligence
      'Algorithm Engineer intern',
      'Data Intelligence Engineer intern',
      'Recommendation System Engineer intern',
      // MLOps / AI Platform
      'MLOps Engineer intern',
      'AI Platform Engineer new grad',
      'AI Research Engineer intern',
    ],
    buildUrl: (keyword: string, page: number): string => {
      const encoded = encodeURIComponent(keyword)
      const start = (page - 1) * 25
      // f_E=1,2: Internship + Entry level; f_TPR=r7776000: last 90 days
      return `https://www.linkedin.com/jobs/search/?keywords=${encoded}&f_E=1%2C2&f_TPR=r7776000&start=${start}`
    },
  },
  {
    name: 'Indeed',
    hostname: 'www.indeed.com',
    keywords: [
      // AI / LLM
      'AI Engineer intern',
      'AI Engineer new grad',
      'LLM Engineer intern',
      'Generative AI intern',
      'AIGC Engineer entry level',
      // Machine Learning
      'Machine Learning Engineer intern',
      'ML Engineer new grad',
      'Applied Machine Learning intern',
      'Machine Learning entry level',
      // Deep Learning / CV / NLP
      'Deep Learning Engineer intern',
      'NLP Engineer intern',
      'NLP Engineer new grad',
      'Computer Vision Engineer intern',
      // Algorithm / Data Intelligence
      'Algorithm Engineer intern',
      'Data Scientist Machine Learning intern',
      'Data Intelligence intern',
      'Recommendation Algorithm intern',
      // MLOps / AI Platform
      'MLOps intern',
      'AI Research intern',
      'Applied AI Engineer entry level',
    ],
    buildUrl: (keyword: string, page: number): string => {
      const encoded = encodeURIComponent(keyword)
      const start = (page - 1) * 10
      // fromage=90: posted within last 90 days (~3 months)
      return `https://www.indeed.com/jobs?q=${encoded}&fromage=90&start=${start}`
    },
  },
  {
    name: 'Boss直聘',
    hostname: 'www.zhipin.com',
    keywords: [
      // AI / 大模型 / LLM
      'AI工程师 校招',
      'AI工程师 实习',
      'LLM工程师 校招',
      '大模型工程师 校招',
      '大模型工程师 实习',
      'AIGC工程师 校招',
      '生成式AI工程师 校招',
      // 机器学习
      '机器学习工程师 校招',
      '机器学习工程师 实习',
      '深度学习工程师 校招',
      '深度学习工程师 实习',
      // NLP / CV / 推荐
      'NLP工程师 校招',
      'NLP工程师 实习',
      '自然语言处理工程师 校招',
      '计算机视觉工程师 校招',
      '计算机视觉工程师 实习',
      '推荐算法工程师 校招',
      '推荐系统工程师 实习',
      // 算法工程 / 数据智能
      '算法工程师 校招',
      '算法工程师 实习',
      '数据智能工程师 校招',
      '搜索算法工程师 校招',
      // AI平台 / MLOps
      'AI平台工程师 校招',
      'MLOps工程师 校招',
    ],
    buildUrl: (keyword: string, page: number): string => {
      const encoded = encodeURIComponent(keyword)
      // city=100010000: 全国; publishTime=3: 最近1个月
      // experience=101,102: 在校生 + 应届生 (requires login to take effect)
      return `https://www.zhipin.com/web/geek/job?query=${encoded}&city=100010000&publishTime=3&experience=101%2C102&page=${page}`
    },
  },
]

const MAX_CONSEC_DUPES = 5   // switch keyword after 5 consecutive seen URLs

// ─── Badge helper ─────────────────────────────────────────────────────────────

function updateBadge(collected: number, target: number) {
  chrome.action.setBadgeText({ text: `${collected}/${target}` })
  chrome.action.setBadgeBackgroundColor({ color: collected >= target ? '#22c55e' : '#3b82f6' })
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

async function navigateTab(tabId: number, url: string): Promise<void> {
  // Re-read state so a Stop click between steps always wins
  const current = await getTaskState()
  if (current.status === 'idle' || current.status === 'done' || current.status === 'error') {
    console.log('[orchestrator] Navigation aborted — task is stopped')
    return
  }
  await chrome.tabs.update(tabId, { url }).catch(err => {
    // Tab was closed between steps — log and let the handler exit gracefully
    console.warn(`[orchestrator] Tab ${tabId} gone, navigation skipped:`, err)
  })
}

async function sendToContentScript<T>(tabId: number, message: Message): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>
}

// ─── Keyword / platform advancement ──────────────────────────────────────────

async function advanceToNextKeywordOrPlatform(state: TaskState): Promise<TaskState> {
  const nextKeywordIndex = state.currentKeywordIndex + 1

  if (nextKeywordIndex < PLATFORMS[state.currentPlatformIndex].keywords.length) {
    // Try next keyword on same platform
    return updateTaskState({
      status: 'searching',
      currentKeywordIndex: nextKeywordIndex,
      currentPage: 1,
      pagesPerKeyword: 0,
      consecutiveDupes: 0,
      pendingLinks: [],
    })
  }

  // Find the next enabled platform after the current one
  const enabled = state.selectedPlatformIndices ?? [0, 1, 2]
  const currentPos = enabled.indexOf(state.currentPlatformIndex)
  const nextPlatformIndex = currentPos >= 0 && currentPos + 1 < enabled.length
    ? enabled[currentPos + 1]
    : -1

  if (nextPlatformIndex >= 0) {
    // Move to next selected platform, reset keywords
    return updateTaskState({
      status: 'searching',
      currentPlatformIndex: nextPlatformIndex,
      currentKeywordIndex: 0,
      currentPage: 1,
      pagesPerKeyword: 0,
      consecutiveDupes: 0,
      pendingLinks: [],
    })
  }

  // All selected platforms and keywords exhausted — export what we have
  console.warn('[orchestrator] All sources exhausted before reaching target.')
  return updateTaskState({ status: 'done' })
}

// ─── Auth-wall / login-page patterns ──────────────────────────────────────────
// If the browser lands on any of these URL fragments it means the user is not
// logged in (or hit a captcha).  We skip the entire platform immediately so the
// agent does not loop through every keyword trying a page it can never scrape.

const AUTH_WALL_PATTERNS = [
  '/login', '/signin', '/checkpoint', '/authwall',
  '/uas/login',           // LinkedIn
  '/challenge',           // LinkedIn CAPTCHA
  '/regwall',             // LinkedIn registration wall
  '/passport/login',      // Boss直聘 / other CN sites
  '/user/login',
]

function isAuthWall(url: string): boolean {
  return AUTH_WALL_PATTERNS.some(p => url.includes(p))
}

/** Skip the current platform entirely and jump to the next selected one. */
async function skipCurrentPlatform(state: TaskState, tabId: number): Promise<void> {
  console.warn(`[orchestrator] Skipping platform "${PLATFORMS[state.currentPlatformIndex].name}" (auth wall or inaccessible)`)
  const enabled = state.selectedPlatformIndices ?? [0, 1, 2]
  const currentPos = enabled.indexOf(state.currentPlatformIndex)
  const nextPlatformIndex = currentPos >= 0 && currentPos + 1 < enabled.length
    ? enabled[currentPos + 1]
    : -1

  if (nextPlatformIndex < 0) {
    console.warn('[orchestrator] No more platforms — finishing with what we have.')
    await updateTaskState({ status: 'done' })
    await triggerCSVDownload()
    return
  }

  const newState = await updateTaskState({
    status: 'searching',
    currentPlatformIndex: nextPlatformIndex,
    currentKeywordIndex: 0,
    currentPage: 1,
    pagesPerKeyword: 0,
    consecutiveDupes: 0,
    pendingLinks: [],
  })
  const platform = PLATFORMS[newState.currentPlatformIndex]
  await navigateTab(tabId, platform.buildUrl(platform.keywords[0], 1))
}

// ─── Core step handlers ───────────────────────────────────────────────────────

/** Called when content script reports the page is ready */
export async function onContentReady(tabId: number): Promise<void> {
  const state = await getTaskState()
  if (!state.activeTabId || state.activeTabId !== tabId) return
  if (state.status === 'idle' || state.status === 'done' || state.status === 'error') return

  // Check for login / auth walls before doing anything else
  const tab = await chrome.tabs.get(tabId).catch(() => null)

  // Re-read state — Stop may have arrived while we awaited chrome.tabs.get
  const freshState = await getTaskState()
  if (freshState.status === 'idle' || freshState.status === 'done' || freshState.status === 'error') return

  const currentUrl = tab?.url ?? ''
  if (currentUrl && isAuthWall(currentUrl)) {
    await skipCurrentPlatform(freshState, tabId)
    return
  }

  if (freshState.status === 'searching') {
    // Page is a search results list — ask content script to extract job links
    await updateTaskState({ status: 'extracting_links' })
    await sendToContentScript(tabId, { type: 'EXTRACT_LINKS' })
    return
  }

  if (freshState.status === 'visiting_detail') {
    // Detail page loaded — ask content script to grab the JD text
    await sendToContentScript(tabId, { type: 'EXTRACT_JD_TEXT' })
    return
  }
}

/** Called with the list of job links from the current search page */
export async function onLinksResult(tabId: number, payload: LinksResultPayload): Promise<void> {
  let state = await getTaskState()
  if (!state.activeTabId || state.activeTabId !== tabId) return
  if (state.status === 'idle' || state.status === 'done' || state.status === 'error') return

  const { links } = payload
  const visitedSet = new Set(state.visitedUrls)

  // Filter out already-visited URLs
  const newLinks = links.filter(u => !visitedSet.has(u))
  const dupeCount = links.length - newLinks.length

  const newConsecDupes = newLinks.length === 0
    ? state.consecutiveDupes + Math.max(dupeCount, 1) // count empty pages too
    : 0

  // Always increment pagesPerKeyword (even for empty/all-dupe pages)
  const newPagesPerKeyword = state.pagesPerKeyword + 1

  // Re-check before mutating state — Stop may have arrived during link extraction
  const recheckLinks = await getTaskState()
  if (recheckLinks.status === 'idle' || recheckLinks.status === 'done' || recheckLinks.status === 'error') return

  // If too many consecutive dupes or page cap hit → advance keyword
  const pageCapHit = newPagesPerKeyword >= state.maxPagesPerKeyword
  if (newConsecDupes >= MAX_CONSEC_DUPES || pageCapHit) {
    console.log(`[orchestrator] Switching keyword (dupes=${newConsecDupes}, pageCap=${pageCapHit})`)
    state = await advanceToNextKeywordOrPlatform(state)
    if (state.status === 'done') return
    const url = PLATFORMS[state.currentPlatformIndex].buildUrl(PLATFORMS[state.currentPlatformIndex].keywords[state.currentKeywordIndex], state.currentPage)
    await navigateTab(tabId, url)
    return
  }

  // Add new links to pending queue
  const mergedPending = [...state.pendingLinks, ...newLinks]
  state = await updateTaskState({
    status: mergedPending.length > 0 ? 'visiting_detail' : 'searching',
    pendingLinks: mergedPending,
    consecutiveDupes: newConsecDupes,
    pagesPerKeyword: newPagesPerKeyword,
    currentPage: mergedPending.length > 0 ? state.currentPage : state.currentPage + 1,
  })

  if (mergedPending.length > 0) {
    // Navigate to the first pending detail link
    await navigateTab(tabId, mergedPending[0])
  } else {
    // No links at all on this page — move to next search page immediately
    console.log('[orchestrator] No new links on this page, advancing to next search page')
    const nextSearchUrl = PLATFORMS[state.currentPlatformIndex].buildUrl(PLATFORMS[state.currentPlatformIndex].keywords[state.currentKeywordIndex], state.currentPage)
    await navigateTab(tabId, nextSearchUrl)
  }
}

/** Called with the raw JD text extracted from a detail page */
export async function onJdTextResult(tabId: number, payload: JdTextResultPayload): Promise<void> {
  let state = await getTaskState()
  if (!state.activeTabId || state.activeTabId !== tabId) return
  if (state.status === 'idle' || state.status === 'done' || state.status === 'error') return

  const { text, url } = payload
  const platform = PLATFORMS[state.currentPlatformIndex]

  await updateTaskState({ status: 'analysing' })

  const config = await getUserConfig()
  const jobData = await analyseJob(text, url, platform.name, config)

  // Re-check after LLM call — Stop may have been pressed during the API request
  const afterLLM = await getTaskState()
  if (afterLLM.status === 'idle' || afterLLM.status === 'done' || afterLLM.status === 'error') {
    // Still record the URL as visited so a resume skips it
    await updateTaskState({ visitedUrls: [...new Set([...afterLLM.visitedUrls, url])] })
    return
  }
  state = afterLLM

  // Mark this URL as visited regardless of whether it qualified
  const updatedVisited = [...new Set([...state.visitedUrls, url])]

  if (jobData) {
    // Secondary dedup: same title + company from different locations/URLs counts as one job
    const jobKey = `${jobData.title.toLowerCase().trim()}||${jobData.company.toLowerCase().trim()}`
    const isDupe = state.savedJobKeys.includes(jobKey)

    if (isDupe) {
      console.log(`[orchestrator] Skipped duplicate (title+company): ${jobData.title} @ ${jobData.company}`)
      state = await updateTaskState({ visitedUrls: updatedVisited })
    } else {
      await saveJob(jobData)
      // Use state.collected + 1 (not getJobCount) so counter reflects current run
      const newCount = state.collected + 1
      const updatedKeys = [...state.savedJobKeys, jobKey]
      updateBadge(newCount, state.target)
      console.log(`[orchestrator] Saved job ${newCount}/${state.target}: ${jobData.title} @ ${jobData.company}`)

      if (newCount >= state.target) {
        await updateTaskState({ status: 'done', collected: newCount, visitedUrls: updatedVisited, savedJobKeys: updatedKeys })
        await triggerCSVDownload()
        return
      }

      state = await updateTaskState({ collected: newCount, visitedUrls: updatedVisited, savedJobKeys: updatedKeys })
    }
  } else {
    state = await updateTaskState({ visitedUrls: updatedVisited })
  }

  // Advance to next pending link
  const remaining = state.pendingLinks.slice(1)

  if (remaining.length > 0) {
    await updateTaskState({ status: 'visiting_detail', pendingLinks: remaining })
    await navigateTab(tabId, remaining[0])
    return
  }

  // No more pending links — go to next search results page
  const nextPage = state.currentPage + 1
  state = await updateTaskState({
    status: 'searching',
    pendingLinks: [],
    currentPage: nextPage,
  })
  const searchUrl = PLATFORMS[state.currentPlatformIndex].buildUrl(
    PLATFORMS[state.currentPlatformIndex].keywords[state.currentKeywordIndex],
    nextPage,
  )
  await navigateTab(tabId, searchUrl)
}

// ─── Public entry points ──────────────────────────────────────────────────────

export async function startTask(tabId: number, selectedPlatformIndices: number[] = [0, 1, 2]): Promise<void> {
  const existing = await getTaskState()

  // Resume if there is in-progress work (stopped mid-run, not yet done)
  const hasProgress = existing.collected > 0
    || existing.visitedUrls.length > 0
    || existing.pendingLinks.length > 0
  const isDone = existing.status === 'done' || existing.collected >= existing.target

  if (hasProgress && !isDone) {
    // Keep all accumulated state; just update the tab handle and platform selection
    const resumeStatus = existing.pendingLinks.length > 0 ? 'visiting_detail' : 'searching'
    const state = await updateTaskState({ status: resumeStatus, activeTabId: tabId, selectedPlatformIndices })
    updateBadge(existing.collected, existing.target)
    console.log(`[orchestrator] Resuming: ${existing.collected}/${existing.target} collected`)

    if (existing.pendingLinks.length > 0) {
      await navigateTab(tabId, existing.pendingLinks[0])
    } else {
      const platform = PLATFORMS[state.currentPlatformIndex]
      const url = platform.buildUrl(platform.keywords[state.currentKeywordIndex], state.currentPage)
      await navigateTab(tabId, url)
    }
    return
  }

  // Fresh start (no prior progress, or previous run is already done)
  await resetTaskState()
  const firstPlatform = selectedPlatformIndices[0] ?? 0
  await updateTaskState({
    status: 'searching',
    activeTabId: tabId,
    selectedPlatformIndices,
    currentPlatformIndex: firstPlatform,
  })
  updateBadge(0, 50)

  const url = PLATFORMS[firstPlatform].buildUrl(PLATFORMS[firstPlatform].keywords[0], 1)
  await navigateTab(tabId, url)
  console.log('[orchestrator] Fresh start on', PLATFORMS[firstPlatform].name, '- navigating to:', url)
}

export async function stopTask(): Promise<void> {
  await updateTaskState({ status: 'idle' })
  chrome.action.setBadgeText({ text: '' })
  console.log('[orchestrator] Task stopped by user')
}

export async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const tabId = sender.tab?.id

  switch (message.type) {
    case 'START_TASK': {
      const { tabId: senderTabId, selectedPlatformIndices } = message.payload as { tabId: number; selectedPlatformIndices: number[] }
      await startTask(senderTabId, selectedPlatformIndices)
      return { ok: true }
    }
    case 'STOP_TASK': {
      await stopTask()
      return { ok: true }
    }
    case 'GET_STATE': {
      return getTaskState()
    }
    case 'EXPORT_CSV': {
      await triggerCSVDownload()
      return { ok: true }
    }
    case 'RESET_DATA': {
      await clearJobs()
      await resetTaskState()
      return { ok: true }
    }
    case 'CONTENT_READY': {
      if (tabId != null) await onContentReady(tabId)
      return { ok: true }
    }
    case 'LINKS_RESULT': {
      if (tabId != null) await onLinksResult(tabId, message.payload as LinksResultPayload)
      return { ok: true }
    }
    case 'JD_TEXT_RESULT': {
      if (tabId != null) await onJdTextResult(tabId, message.payload as JdTextResultPayload)
      return { ok: true }
    }
    default:
      return { error: 'Unknown message type' }
  }
}
