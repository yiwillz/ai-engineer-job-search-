// ─── Strategy Pattern Interface ───────────────────────────────────────────────
// Every platform adapter must implement this contract.
// The Background (Orchestrator) only talks to this interface — it never knows
// which website is currently open.

export interface SiteAdapter {
  readonly platformName: string

  /**
   * Extract all job detail-page URLs visible on the current search results page.
   * Must scroll to trigger lazy-loading before collecting links.
   */
  extractJobLinks(): Promise<string[]>

  /**
   * Extract the full raw text of the job posting on the current detail page.
   * Returns concatenated title + company + location + description innerText.
   * No semantic parsing — that is the LLM's job.
   */
  extractJobDetailText(): Promise<string>

}
