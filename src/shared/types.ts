// ─── Output Data Schema ───────────────────────────────────────────────────────
// Final CSV/JSON fields as required by the assignment spec

export interface JobData {
  title: string;
  company: string;
  location: string;
  salary: string;          // empty string if not listed
  tech_tags: string[];     // e.g. ["LLM", "NLP", "CV"]
  requirements: string;    // LLM-summarised core skills
  source: string;          // e.g. "LinkedIn", "Indeed"
  job_url: string;
}

// ─── Agent State Machine ──────────────────────────────────────────────────────
// Persisted to chrome.storage.local so the Service Worker survives sleep/wake

export type AgentStatus =
  | 'idle'
  | 'searching'       // navigating to a search results page
  | 'extracting_links' // content script is collecting job card URLs
  | 'visiting_detail'  // navigating to a job detail page
  | 'analysing'        // LLM is judging / extracting the JD
  | 'done'
  | 'error';

export interface TaskState {
  status: AgentStatus;
  target: number;                 // default 50
  collected: number;              // how many valid jobs saved so far
  visitedUrls: string[];          // dedup set — serialised as array for storage
  pendingLinks: string[];         // queue of detail-page URLs yet to be visited
  currentKeywordIndex: number;    // index into SEARCH_KEYWORDS array
  currentPage: number;            // pagination counter for current keyword
  pagesPerKeyword: number;        // how many pages consumed for current keyword
  maxPagesPerKeyword: number;     // anti-loop cap (default 10)
  consecutiveDupes: number;       // consecutive already-seen URLs (triggers keyword switch)
  currentPlatformIndex: number;   // index into PLATFORMS array
  activeTabId: number | null;     // tab the agent is controlling
  savedJobKeys: string[];         // dedup by "title||company" to block multi-location duplicates
  selectedPlatformIndices: number[]; // which platforms to search (0=LinkedIn,1=Indeed,2=Boss)
  errorMessage?: string;
  lastUpdated: number;            // Date.now() timestamp
}

export const DEFAULT_TASK_STATE: TaskState = {
  status: 'idle',
  target: 50,
  collected: 0,
  visitedUrls: [],
  pendingLinks: [],
  currentKeywordIndex: 0,
  currentPage: 1,
  pagesPerKeyword: 0,
  maxPagesPerKeyword: 10,
  consecutiveDupes: 0,
  currentPlatformIndex: 0,
  activeTabId: null,
  savedJobKeys: [],
  selectedPlatformIndices: [0, 1, 2],
  lastUpdated: 0,
};

// ─── User Configuration ───────────────────────────────────────────────────────
// Stored in chrome.storage.local, entered via Popup

export interface UserConfig {
  apiKey: string;
  apiBaseUrl: string;   // e.g. "https://api.openai.com/v1" or DeepSeek endpoint
  model: string;        // e.g. "gpt-4o-mini" or "deepseek-chat"
  targetRole: string;   // e.g. "AI Engineer 校招/实习"
}

export const DEFAULT_USER_CONFIG: UserConfig = {
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  targetRole: 'AI Engineer 校招/实习',
};

// ─── Message Passing Protocol ─────────────────────────────────────────────────
// Strict typed payloads for chrome.runtime.sendMessage between all contexts

export type MessageType =
  // Popup -> Background
  | 'START_TASK'
  | 'STOP_TASK'
  | 'GET_STATE'
  | 'EXPORT_CSV'
  | 'RESET_DATA'
  // Background -> Content Script (commands)
  | 'EXTRACT_LINKS'
  | 'EXTRACT_JD_TEXT'
  // Content Script -> Background (results)
  | 'LINKS_RESULT'
  | 'JD_TEXT_RESULT'
  | 'CONTENT_READY';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// Specific payload shapes
export interface LinksResultPayload {
  links: string[];
}

export interface JdTextResultPayload {
  text: string;
  url: string;
}

