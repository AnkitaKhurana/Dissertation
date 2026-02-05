// Inline constants to avoid module imports
const ANALYZE_BUTTON_ID = "pr-sentinel-analyze-button";
const PANEL_ID = "pr-sentinel-panel";

const INLINE_STYLE_ID = "pr-sentinel-inline-style";
const INLINE_FINDING_CLASS = "pr-sentinel-inline-finding";
const INLINE_BADGE_CLASS = "pr-sentinel-inline-badge";

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

// Inline loadPreference helper
async function loadPreference<T>(key: string): Promise<T | null> {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get([key]);
    return (result[key] as T) ?? null;
  }
  return null;
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

      clearInlineFindings();

      // Get enabled agents from settings
      const enabledAgents = (await loadPreference("enabledAgents")) || {
        code_review: true,
        security: true,
        tests: true,
        maintainability: true,
      };

      const agents = Object.entries(enabledAgents)
        .filter(([_, enabled]) => enabled)
        .map(([agent]) => agent);

      console.log("[Content] Starting analysis with agents:", agents);

      const response = await sendMessage({
        type: "ANALYZE_PR",
        prUrl,
        agents,
      } as ExtensionMessage);

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
    } catch (error) {
      console.error("[Content] Analysis error:", error);
      status.textContent = "Error";
      status.className = "status error";
      btn.disabled = false;
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
  if (message.type === "JOB_STATUS_UPDATE") {
    const shadowHost = document.getElementById(ANALYZE_BUTTON_ID);
    const statusNode = shadowHost?.shadowRoot?.querySelector(".status");
    const buttonNode = shadowHost?.shadowRoot?.querySelector("button");
    
    if (statusNode) {
      const progress = (message.progress || 0) * 100;
      statusNode.textContent = `${message.status} (${progress.toFixed(0)}%)`;
      statusNode.className =
        message.status === "completed" ? "status success" :
        message.status === "failed" ? "status error" :
        "status";
    }

    // Reset button when job completes or fails
    if (buttonNode && ["completed", "failed", "cancelled"].includes(message.status)) {
      buttonNode.textContent = "Analyze PR";
      buttonNode.disabled = false;
    }

    if (message.status === "completed" && message.results_so_far) {
      renderInlineFindings(message.results_so_far as any[]);
    }
    return false; // Don't keep channel open
  }
  return false; // Always return false for unhandled messages
});

// Watch for page changes
const observer = new MutationObserver((mutations) => {
  if (!document.getElementById(ANALYZE_BUTTON_ID)) {
    attachShadowUi();
  }
});

observer.observe(document.documentElement, { 
  childList: true, 
  subtree: true 
});

// Initial attempt
attachShadowUi();

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
  if (!showSuggestions) return;

  if (!Array.isArray(findings) || findings.length === 0) {
    console.log("[Content] No findings to render");
    return;
  }

  console.log("[Content] Rendering inline findings:", findings.length);
  
  ensureInlineStyles();
  clearInlineFindings();

  // Find file headers first (these contain the file path)
  const fileHeaders = Array.from(
    document.querySelectorAll(
      "button[aria-label*='Show'], div[class*='Header'], [class*='file-header'], button[title*='.']"
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
    if (ariaLabel.includes("Show")) {
      // aria-label format: "Show 1 hidden line in file filename.ext"
      const match = ariaLabel.match(/in file (.+)/);
      if (match) filePath = match[1];
    } else if (title && title.includes(".")) {
      filePath = title.trim();
    } else if (text && text.includes(".")) {
      filePath = text.trim();
    }
    
    if (filePath && filePath.length < 300) { // Sanity check - filenames shouldn't be huge
      console.log("[Content] Extracted file path:", filePath);
      filePathsFromDOM.set(filePath, header);
    }
  }
  
  console.log("[Content] Mapped file paths from DOM:", filePathsFromDOM.size, Array.from(filePathsFromDOM.keys()));
  
  const byFile = new Map<string, any[]>();

  for (const finding of findings) {
    const filePath = String(finding.file_path || finding.filePath || "").replace(/^\//, "");
    if (!filePath || filePath === "PR_SUMMARY.txt") continue; // Skip summary entries
    const list = byFile.get(filePath) || [];
    list.push(finding);
    byFile.set(filePath, list);
  }
  console.log("[Content] Findings grouped by file:", byFile.size, Array.from(byFile.keys()).slice(0, 5));

  // Try to render findings
  let renderedCount = 0;
  for (const [filePath, findingsList] of byFile.entries()) {
    console.log(`[Content] Looking for DOM match for file: "${filePath}"`);
    let fileHeader = filePathsFromDOM.get(filePath);
    
    if (!fileHeader) {
      console.log("[Content] No exact match, trying fuzzy match...");
      // Try fuzzy matching - file might be at different path
      for (const [domPath, header] of filePathsFromDOM.entries()) {
        if (domPath.includes(filePath) || filePath.includes(domPath)) {
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
    let fileContainer = fileHeader;
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

    const table = fileContainer.querySelector("table");
    if (!table) {
      console.log("[Content] Still no table in container for:", filePath);
      continue;
    }

    console.log(`[Content] Found table for ${filePath}, rendering ${findingsList.length} findings`);

    for (const finding of findingsList) {
      const lineNumber = Number(finding.line_number || finding.line || 0);
      if (!lineNumber) {
        console.log("[Content] Skipping finding with line_number=0 or undefined");
        continue;
      }

      // Find line in table
      const lineCell = table.querySelector(`td[data-line-number='${lineNumber}']`) as HTMLElement | null;
      const lineRow = lineCell?.closest("tr");
      if (!lineRow) {
        console.log(`[Content] No row found for line ${lineNumber} in ${filePath}`);
        continue;
      }

      const colspan = lineRow.querySelectorAll("td").length || 4;
      const row = document.createElement("tr");
      row.className = INLINE_FINDING_CLASS;

      const td = document.createElement("td");
      td.colSpan = colspan;

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
      lineRow.after(row);
      renderedCount++;
      
      // Verify the row was actually inserted
      const verifyRow = lineRow.nextElementSibling;
      console.log(`[Content] ✓ Rendered finding at line ${lineNumber}, row visible: ${!!verifyRow && verifyRow.className.includes(INLINE_FINDING_CLASS)}`);
    }
  }
  console.log("[Content] Total findings rendered:", renderedCount);
}
