import type { ExtensionMessage } from "./types";
import { DEFAULT_JS_TS_ENABLED_AGENTS, normalizeEnabledAgents } from "../utils/agents";
// Inline constants to avoid module imports
const ANALYZE_BUTTON_ID = "pr-sentinel-analyze-button";

const INLINE_STYLE_ID = "pr-sentinel-inline-style";
const INLINE_FINDING_CLASS = "pr-sentinel-inline-finding";
const INLINE_BADGE_CLASS = "pr-sentinel-inline-badge";
const STATUS_POLL_INTERVAL_MS = 5000; // Poll faster so the button recovers promptly
const PROGRESS_TICK_MS = 1000;
const ANALYZE_RESPONSE_TIMEOUT_MS = 25000;

let activeJobId: string | null = null;
let statusPollTimer: number | null = null;
let progressTicker: number | null = null;
let displayedProgress = 0;

interface JobStatusUpdateMessage {
  status: string;
  progress?: number;
  results_so_far?: unknown[];
  error?: string;
}

// Add console logging for debugging
console.log("[Content] Script loaded and running on:", window.location.href);

// Inline sendMessage helper
function sendMessage<T = unknown>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error("Chrome runtime unavailable"));
      return;
    }

    chrome.runtime.sendMessage(message, (response: T) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
      } else {
        resolve(response);
      }
    });
  });
}

async function sendMessageWithTimeout<T = unknown>(message: any, timeoutMs = ANALYZE_RESPONSE_TIMEOUT_MS): Promise<T> {
  let timeoutHandle: number | null = null;
  try {
    return await Promise.race([
      sendMessage<T>(message),
      new Promise<T>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
          reject(new Error(`Timed out waiting for background response after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

function stopStatusPolling() {
  if (statusPollTimer !== null) {
    window.clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
}

function stopProgressTicker() {
  if (progressTicker !== null) {
    window.clearInterval(progressTicker);
    progressTicker = null;
  }
}

function startProgressTicker() {
  stopProgressTicker();
  progressTicker = window.setInterval(() => {
    if (!activeJobId) {
      stopProgressTicker();
      return;
    }

    if (displayedProgress < 95) {
      displayedProgress = displayedProgress > 0 ? Math.min(displayedProgress + 3, 95) : 5;
      applyJobStatus({ status: "running", progress: displayedProgress / 100 });
    }
  }, PROGRESS_TICK_MS);
}

async function startStatusPolling(jobId: string) {
  activeJobId = jobId;
  console.log("[Content] startStatusPolling:", { jobId });
  await savePreference("activeJobId", jobId);
  displayedProgress = 0;
  stopStatusPolling();
  startProgressTicker();

  const pollOnce = async () => {
    if (!activeJobId) {
      return;
    }

    try {
      console.log("[Content] Polling job status:", activeJobId);
      const response = await sendMessage<any>({ type: "GET_STATUS", jobId: activeJobId });
      console.log("[Content] Poll response raw:", response);
      if (response?.error) {
        console.warn("[Content] Status poll error:", response.error);
      } else if (response?.status) {
        console.log("[Content] Status poll response:", response.status, response.progress);
        applyJobStatus(response);
      }

      if (response?.status && ["completed", "failed", "cancelled"].includes(response.status)) {
        stopStatusPolling();
        return;
      }
    } catch (error) {
      console.warn("[Content] Status polling request failed:", error);
    }

    statusPollTimer = window.setTimeout(pollOnce, STATUS_POLL_INTERVAL_MS);
  };

  void pollOnce();
}

async function resumeStatusPollingFromStorage() {
  const storedJobId = await loadPreference<string>("activeJobId");
  if (storedJobId) {
    console.log("[Content] Resuming status polling for job:", storedJobId);
    activeJobId = storedJobId;
    void startStatusPolling(storedJobId);
  }
}

function applyJobStatus(message: JobStatusUpdateMessage) {
  console.log("[Content] applyJobStatus:", {
    status: message.status,
    progress: message.progress,
    hasResults: Array.isArray(message.results_so_far) ? message.results_so_far.length : 0,
    activeJobId,
  });
  const shadowHost = document.getElementById(ANALYZE_BUTTON_ID);
  const statusNode = shadowHost?.shadowRoot?.querySelector(".status");
  const buttonNode = shadowHost?.shadowRoot?.querySelector("button");

  const terminal = ["completed", "failed", "cancelled"].includes(message.status);
  const backendProgress = typeof message.progress === "number" ? message.progress : null;

  if (backendProgress !== null && backendProgress > 0) {
    displayedProgress = Math.round(Math.max(0, Math.min(backendProgress, 1)) * 100);
  } else if (message.status === "completed") {
    displayedProgress = 100;
  } else if (displayedProgress === 0 && (message.status === "running" || message.status === "pending")) {
    displayedProgress = 5;
  }

  if (statusNode && message.status) {
    statusNode.textContent = `${message.status} (${displayedProgress.toFixed(0)}%)`;
    statusNode.className =
      message.status === "completed" ? "status success" :
      message.status === "failed" ? "status error" :
      "status";
  }

  if (buttonNode && terminal) {
    buttonNode.textContent = "Analyze PR";
    buttonNode.disabled = false;
  }

  if (message.status === "completed" && message.results_so_far) {
    renderInlineFindings(message.results_so_far as any[]);
  }

  if (terminal) {
    console.log("[Content] Terminal status reached:", message.status, "clearing active job state");
    stopStatusPolling();
    stopProgressTicker();
    activeJobId = null;
    void savePreference("activeJobId", null);
  }
}

// Inline loadPreference helper
async function loadPreference<T>(key: string): Promise<T | null> {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get([key]);
    return (result[key] as T) ?? null;
  }
  return null;
}

async function savePreference<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ [key]: value });
  }
}

/**
 * Extract PR URL from current GitHub page
 * Validates that we're on a GitHub PR page
 */
function extractPRUrl(): string | null {
  const url = window.location.href;

  // Check if we're on a GitHub PR page
  if (!url.includes("github.com") || !url.includes("/pull/")) {
    return null;
  }

  // Validate it's a proper PR URL format
  const prMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (!prMatch) {
    console.warn("[Content] Invalid PR URL format:", url);
    return null;
  }

  // Return the PR URL (without query params or hash)
  const baseUrl = url.split("#")[0].split("?")[0];
  console.log("[Content] Extracted PR URL:", baseUrl);
  return baseUrl;
}

export function attachShadowUi(): void {
  if (document.getElementById(ANALYZE_BUTTON_ID)) {
    return; // Already attached
  }

  const prUrl = extractPRUrl();
  if (!prUrl) {
    return; // Not on PR page
  }

  // Create container with fixed positioning
  const host = document.createElement("div");
  host.id = ANALYZE_BUTTON_ID;
  host.style.position = "fixed";
  host.style.top = "10px";
  host.style.right = "10px";
  host.style.zIndex = "99999";
  host.style.display = "flex";
  host.style.alignItems = "center";
  host.style.gap = "12px";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      display: flex;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    button { 
      background: #22c55e; 
      color: #0b1120; 
      border: none; 
      padding: 8px 14px; 
      border-radius: 6px; 
      cursor: pointer; 
      font-weight: 600; 
      font-size: 12px;
      white-space: nowrap;
      min-height: 32px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
    }
    button:disabled { 
      background: #94a3b8; 
      cursor: not-allowed;
      opacity: 0.7;
    }
    button:hover:not(:disabled) { 
      background: #16a34a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .status { 
      color: #06b6d4; 
      font-size: 12px; 
      font-weight: 500;
      min-width: 100px;
    }
    .offline { color: #ef4444; }
    .error { color: #f97316; }
    .success { color: #22c55e; }
  `;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.textContent = "Analyze PR";
  btn.title = "Analyze this PR with PR Sentinel";
  btn.type = "button";
  shadow.appendChild(btn);

  const status = document.createElement("span");
  status.className = "status";
  status.textContent = "";
  shadow.appendChild(status);

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      status.textContent = "Analyzing...";
      status.className = "status";

      console.log("[Content] Analyze button clicked:", { prUrl });

      clearInlineFindings();

      // Get enabled agents from settings
      const enabledAgents = normalizeEnabledAgents(await loadPreference("enabledAgents")) || DEFAULT_JS_TS_ENABLED_AGENTS;

      const agents = Object.entries(enabledAgents)
        .filter(([_, enabled]) => enabled)
        .map(([agent]) => agent);

      console.log("[Content] Starting analysis with agents:", agents);

      console.log("[Content] Sending ANALYZE_PR message to background");
      const response = await sendMessageWithTimeout({
        type: "ANALYZE_PR",
        prUrl,
        agents,
      } as ExtensionMessage);

      console.log("[Content] ANALYZE_PR response:", response);

      if ((response as any)?.type === "OFFLINE") {
        status.textContent = "Offline";
        status.className = "status offline";
        btn.disabled = false;
        return;
      }

      if ((response as any)?.error) {
        status.textContent = `Error: ${(response as any).error}`;
        status.className = "status error";
        btn.disabled = false;
        return;
      }

      status.textContent = `Job: ${(response as any)?.jobId || "started"}`;
      status.className = "status success";
      btn.textContent = "Analyzing...";

      if ((response as any)?.jobId) {
        console.log("[Content] Starting status polling for job:", (response as any).jobId);
        void startStatusPolling((response as any).jobId);
      }
    } catch (error) {
      console.error("[Content] Analysis error:", error);
      status.textContent = "Error";
      status.className = "status error";
      btn.disabled = false;
      btn.textContent = "Analyze PR";
    }
  });

  window.addEventListener("offline", () => {
    status.textContent = "Offline";
    status.className = "status offline";
    btn.disabled = true;
  });

  window.addEventListener("online", () => {
    status.textContent = "";
    status.className = "status";
    btn.disabled = false;
  });

  // Inject into body as fixed position
  document.body.appendChild(host);
  console.log("[Content] ✓ Button injected as fixed position element");
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  console.log("[Content] chrome.runtime.onMessage:", message);
  if (message.type === "JOB_STATUS_UPDATE") {
    applyJobStatus(message as JobStatusUpdateMessage);
    return false; // Don't keep channel open
  }
  return false; // Always return false for unhandled messages
});

// Watch for page changes
const observer = new MutationObserver((_mutations) => {
  if (typeof document === "undefined") {
    return;
  }

  if (!document.getElementById(ANALYZE_BUTTON_ID)) {
    attachShadowUi();
  }
});

if (typeof document !== "undefined" && document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Initial attempt
attachShadowUi();
resumeStatusPollingFromStorage();

// Retry after delay
setTimeout(() => {
  if (!document.getElementById(ANALYZE_BUTTON_ID)) {
    console.log("[Content] Retrying button attachment");
    attachShadowUi();
  }
}, 2000);

function ensureInlineStyles() {
  if (document.getElementById(INLINE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = INLINE_STYLE_ID;
  style.textContent = `
    .${INLINE_FINDING_CLASS} {
      background: rgba(15, 23, 42, 0.95) !important;
      border-left: 4px solid #f97316 !important;
    }
    .${INLINE_FINDING_CLASS} td {
      background: rgba(15, 23, 42, 0.95) !important;
      color: #e2e8f0 !important;
      border-left: 4px solid #f97316 !important;
      padding: 8px 12px !important;
      font-size: 12px !important;
      display: table-cell !important;
    }
    .${INLINE_FINDING_CLASS} .meta {
      display: flex !important;
      gap: 8px !important;
      align-items: center !important;
      margin-bottom: 6px !important;
      font-weight: 600 !important;
    }
    .${INLINE_FINDING_CLASS} .badge {
      padding: 2px 6px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      font-weight: 700 !important;
      background: rgba(34,197,94,0.2) !important;
      color: #22c55e !important;
      display: inline-block !important;
    }
    .${INLINE_FINDING_CLASS} .badge.severity-high { background: rgba(239,68,68,0.2) !important; color: #ef4444 !important; }
    .${INLINE_FINDING_CLASS} .badge.severity-medium { background: rgba(249,115,22,0.2) !important; color: #f97316 !important; }
    .${INLINE_FINDING_CLASS} .badge.severity-low { background: rgba(14,165,233,0.2) !important; color: #0ea5e9 !important; }
    .${INLINE_FINDING_CLASS} .badge.severity-info { background: rgba(148,163,184,0.2) !important; color: #94a3b8 !important; }
    .${INLINE_FINDING_CLASS} pre {
      white-space: pre-wrap !important;
      background: rgba(2,6,23,0.6) !important;
      padding: 8px !important;
      border-radius: 6px !important;
      margin-top: 6px !important;
      color: #e2e8f0 !important;
    }
    .${INLINE_BADGE_CLASS} {
      margin-left: 6px !important;
      font-size: 11px !important;
      color: #22c55e !important;
      font-weight: 700 !important;
    }
  `;
  document.head.appendChild(style);
}

function clearInlineFindings() {
  document.querySelectorAll(`.${INLINE_FINDING_CLASS}`).forEach((node) => node.remove());
  document.querySelectorAll(`.${INLINE_BADGE_CLASS}`).forEach((node) => node.remove());
}

async function renderInlineFindings(findings: any[]) {
  const showSuggestions = (await loadPreference("showSuggestions")) ?? true; // Default to true
  console.log("[Content] renderInlineFindings start:", {
    findings: Array.isArray(findings) ? findings.length : 0,
    showSuggestions,
    activeJobId,
  });
  if (!showSuggestions) return;

  if (!Array.isArray(findings) || findings.length === 0) {
    console.log("[Content] No findings to render");
    return;
  }

  console.log("[Content] Rendering inline findings:", findings.length);
  
  ensureInlineStyles();
  clearInlineFindings();

  const normalizePath = (value: string) =>
    String(value || "")
      .trim()
      .replace(/^\//, "")
      .replace(/^\.\//, "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .toLowerCase();

  // Find file headers first (these contain the file path).
  // Prefer stable GitHub attributes used on Files tab containers/anchors.
  const fileHeaders = Array.from(
    document.querySelectorAll(
      "[data-path], [data-tagsearch-path], [data-file-path], a[title][href*='#diff-'], div.file-header, [class*='file-header']"
    )
  ) as HTMLElement[];
  
  console.log("[Content] Found potential file headers:", fileHeaders.length);
  fileHeaders.forEach(h => {
    console.log("[Content] Header - aria-label:", h.getAttribute("aria-label"), "title:", h.getAttribute("title"), "text:", h.textContent?.substring(0, 50));
  });
  
  // Extract file paths from headers/labels
  const filePathsFromDOM = new Map<string, HTMLElement>();
  for (const header of fileHeaders) {
    const ariaLabel = header.getAttribute("aria-label") || "";
    const title = header.getAttribute("title") || "";
    const dataPath =
      header.getAttribute("data-path") ||
      header.getAttribute("data-tagsearch-path") ||
      header.getAttribute("data-file-path") ||
      "";
    let text = header.textContent || "";
    
    // Clean up text - remove all the menu options and extra whitespace
    text = text
      .replace(/Collapse file/g, "")
      .replace(/Expand file/g, "")
      .replace(/Copy file name/g, "")
      .replace(/to clipboard/g, "")
      .replace(/Lines changed:/g, "")
      .replace(/additions &/g, "")
      .replace(/deletions/g, "")
      .replace(/More options/g, "")
      .replace(/Viewed/g, "")
      .replace(/Comment on this file/g, "")
      .replace(/[\u200e\u200f]/g, "") // Remove special Unicode chars
      .trim()
      .split("\n")[0]; // Take first line only
    
    // Try to extract file path from various sources
    let filePath = "";
    if (dataPath) {
      filePath = dataPath.trim();
    } else if (ariaLabel.includes("Show")) {
      // aria-label format: "Show 1 hidden line in file filename.ext"
      const match = ariaLabel.match(/in file (.+)/);
      if (match) filePath = match[1];
    } else if (title && title.includes(".")) {
      filePath = title.trim();
    } else if (text && text.includes(".")) {
      filePath = text.trim();
    }
    
    if (filePath && filePath.length < 300) { // Sanity check - filenames shouldn't be huge
      const normalized = normalizePath(filePath);
      console.log("[Content] Extracted file path:", filePath, "normalized:", normalized);
      filePathsFromDOM.set(normalized, header);
    }
  }
  
  console.log("[Content] Mapped file paths from DOM:", filePathsFromDOM.size, Array.from(filePathsFromDOM.keys()));
  
  const byFile = new Map<string, any[]>();

  for (const finding of findings) {
    const filePath = normalizePath(String(finding.file_path || finding.filePath || "").replace(/^\//, ""));
    if (!filePath || filePath === "pr_summary.txt") continue; // Skip summary entries
    const list = byFile.get(filePath) || [];
    list.push(finding);
    byFile.set(filePath, list);
  }
  console.log("[Content] Findings grouped by file:", byFile.size, Array.from(byFile.keys()).slice(0, 5));

  // Add a small badge next to file headers indicating number of findings
  for (const [filePath, findingsList] of byFile.entries()) {
    let header = filePathsFromDOM.get(filePath) as HTMLElement | undefined;
    if (!header) {
      for (const [domPath, h] of filePathsFromDOM.entries()) {
        if (domPath.includes(filePath) || filePath.includes(domPath) || domPath.endsWith('/' + filePath) || filePath.endsWith('/' + domPath)) {
          header = h as HTMLElement;
          break;
        }
      }
    }

    if (!header) continue;

    // Avoid duplicate badge
    if (header.querySelector && header.querySelector(`.${INLINE_BADGE_CLASS}`)) continue;

    const badge = document.createElement('span');
    badge.className = INLINE_BADGE_CLASS;
    badge.textContent = `${findingsList.length} findings`;
    try {
      header.appendChild(badge);
    } catch (e) {
      header.parentElement?.appendChild(badge);
    }
  }

  // Try to render findings
  let renderedCount = 0;
  for (const [filePath, findingsList] of byFile.entries()) {
    console.log(`[Content] Looking for DOM match for file: "${filePath}"`);
    let fileHeader: HTMLElement | null = (filePathsFromDOM.get(filePath) as HTMLElement) ?? null;
    
    if (!fileHeader) {
      console.log("[Content] No exact match, trying fuzzy match...");
      // Try fuzzy matching - file might be at different path
      for (const [domPath, header] of filePathsFromDOM.entries()) {
        if (domPath.includes(filePath) || filePath.includes(domPath) || domPath.endsWith('/' + filePath) || filePath.endsWith('/' + domPath)) {
          console.log("[Content] Fuzzy matched:", filePath, "←→", domPath);
          fileHeader = header;
          break;
        }
      }
    }
    
    if (!fileHeader) {
      console.log("[Content] No DOM match for file:", filePath);
      continue;
    }

    // Find the file container (parent div) that contains this header
    let fileContainer: HTMLElement | null = fileHeader;
    while (fileContainer && !fileContainer.querySelector("table")) {
      fileContainer = fileContainer.parentElement;
      if (!fileContainer || fileContainer === document.body) {
        fileContainer = null;
        break;
      }
    }

    if (!fileContainer) {
      console.log("[Content] No file container/table found for:", filePath);
      continue;
    }

    const diffRoot =
      (fileContainer.querySelector("table") as HTMLElement | null) ||
      (fileContainer.querySelector("[data-path], [data-tagsearch-path], .js-file-content") as HTMLElement | null) ||
      fileContainer;

    if (!diffRoot) {
      console.log("[Content] Still no diff root in container for:", filePath);
      continue;
    }

    console.log(`[Content] Found diff root for ${filePath}, rendering ${findingsList.length} findings`);

    for (const finding of findingsList) {
      const lineNumber = Number(finding.line_number || finding.line || 0);
      if (!lineNumber) {
        console.log("[Content] Skipping finding with line_number=0 or undefined");
        continue;
      }

      // Find line in table / diff container
      const lineCell =
        (diffRoot.querySelector(`td[data-line-number='${lineNumber}']`) as HTMLElement | null) ||
        (diffRoot.querySelector(`[data-line-number='${lineNumber}']`) as HTMLElement | null) ||
        (diffRoot.querySelector(`#L${lineNumber}`) as HTMLElement | null) ||
        (diffRoot.querySelector(`#LC${lineNumber}`) as HTMLElement | null) ||
        (diffRoot.querySelector(`#R${lineNumber}`) as HTMLElement | null);
      const lineRow = lineCell?.closest("tr") as HTMLElement | null;
      if (!lineCell) {
        console.log(`[Content] No line node found for line ${lineNumber} in ${filePath}`);
        continue;
      }

      const isTableLayout = !!lineRow;
      const row = document.createElement(isTableLayout ? "tr" : "div");
      row.className = INLINE_FINDING_CLASS;

      const td = document.createElement(isTableLayout ? "td" : "div");
      if (isTableLayout) {
        const colspan = lineRow?.querySelectorAll("td").length || 4;
        (td as HTMLTableCellElement).colSpan = colspan;
      }

      const meta = document.createElement("div");
      meta.className = "meta";

      const severity = String(finding.severity || "info").toLowerCase();
      const severityBadge = document.createElement("span");
      severityBadge.className = `badge severity-${severity}`;
      severityBadge.textContent = severity;

      const agentBadge = document.createElement("span");
      agentBadge.className = "badge";
      agentBadge.textContent = String(finding.agent || "agent");

      const fileBadge = document.createElement("span");
      fileBadge.className = INLINE_BADGE_CLASS;
      fileBadge.textContent = `${filePath}:${lineNumber}`;

      meta.appendChild(severityBadge);
      meta.appendChild(agentBadge);
      meta.appendChild(fileBadge);

      const message = document.createElement("div");
      message.textContent = String(finding.message || finding.recommendation || "Finding");

      td.appendChild(meta);
      td.appendChild(message);

      if (finding.suggested_code) {
        const pre = document.createElement("pre");
        pre.textContent = String(finding.suggested_code);
        td.appendChild(pre);
      }

      row.appendChild(td);
      if (isTableLayout && lineRow) {
        lineRow.after(row);
      } else {
        const anchor = lineCell.closest(".js-file-line, .blob-code-inner, .blob-code, div") as HTMLElement | null;
        (anchor || lineCell).after(row);
      }
      renderedCount++;
      
      // Verify the row was actually inserted
      const verifyRow = isTableLayout ? lineRow?.nextElementSibling : row;
      console.log(`[Content] ✓ Rendered finding at line ${lineNumber}, row visible: ${!!verifyRow && verifyRow.className.includes(INLINE_FINDING_CLASS)}`);
    }
  }
  console.log("[Content] Total findings rendered:", renderedCount);
}
