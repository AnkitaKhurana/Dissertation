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
    if (statusNode) {
      const progress = (message.progress || 0) * 100;
      statusNode.textContent = `${message.status} (${progress.toFixed(0)}%)`;
      statusNode.className =
        message.status === "completed" ? "status success" :
        message.status === "failed" ? "status error" :
        "status";
    }

    if (message.status === "completed" && message.results_so_far) {
      renderInlineFindings(message.results_so_far as any[]);
    }
  }
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
    .${INLINE_FINDING_CLASS} td {
      background: rgba(15, 23, 42, 0.85);
      color: #e2e8f0;
      border-left: 4px solid #f97316;
      padding: 8px 12px;
      font-size: 12px;
    }
    .${INLINE_FINDING_CLASS} .meta {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .${INLINE_FINDING_CLASS} .badge {
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      background: rgba(34,197,94,0.2);
      color: #22c55e;
    }
    .${INLINE_FINDING_CLASS} .badge.severity-high { background: rgba(239,68,68,0.2); color: #ef4444; }
    .${INLINE_FINDING_CLASS} .badge.severity-medium { background: rgba(249,115,22,0.2); color: #f97316; }
    .${INLINE_FINDING_CLASS} .badge.severity-low { background: rgba(14,165,233,0.2); color: #0ea5e9; }
    .${INLINE_FINDING_CLASS} .badge.severity-info { background: rgba(148,163,184,0.2); color: #94a3b8; }
    .${INLINE_FINDING_CLASS} pre {
      white-space: pre-wrap;
      background: rgba(2,6,23,0.6);
      padding: 8px;
      border-radius: 6px;
      margin-top: 6px;
    }
    .${INLINE_BADGE_CLASS} {
      margin-left: 6px;
      font-size: 11px;
      color: #22c55e;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

function clearInlineFindings() {
  document.querySelectorAll(`.${INLINE_FINDING_CLASS}`).forEach((node) => node.remove());
  document.querySelectorAll(`.${INLINE_BADGE_CLASS}`).forEach((node) => node.remove());
}

async function renderInlineFindings(findings: any[]) {
  const showSuggestions = await loadPreference("showSuggestions");
  if (!showSuggestions) return;

  if (!Array.isArray(findings) || findings.length === 0) return;

  ensureInlineStyles();
  clearInlineFindings();

  const fileContainers = Array.from(document.querySelectorAll("div.js-file, div.file")) as HTMLElement[];
  const byFile = new Map<string, any[]>();

  for (const finding of findings) {
    const filePath = String(finding.file_path || finding.filePath || "").replace(/^\//, "");
    if (!filePath) continue;
    const list = byFile.get(filePath) || [];
    list.push(finding);
    byFile.set(filePath, list);
  }

  for (const fileEl of fileContainers) {
    const filePath = fileEl.getAttribute("data-path") || fileEl.getAttribute("data-file-path") || "";
    const list = byFile.get(filePath);
    if (!list || list.length === 0) continue;

    for (const finding of list) {
      const lineNumber = Number(finding.line_number || finding.line || 0);
      if (!lineNumber) continue;

      const lineCell = fileEl.querySelector(`td[data-line-number='${lineNumber}']`) as HTMLElement | null;
      const lineRow = lineCell?.closest("tr");
      if (!lineRow) continue;

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
    }
  }
}

