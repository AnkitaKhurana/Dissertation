import { ANALYZE_BUTTON_ID } from "../constants/selectors";
import { sendMessage } from "../utils/messaging";
import { ExtensionMessage } from "./types";
import { loadPreference } from "../services/storage";

const HEADER_SELECTORS = [".gh-header-actions", "[data-testid='pr-header-actions']", "#partial-discussion-header .d-flex"];

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
  if (document.getElementById(ANALYZE_BUTTON_ID)) return;

  const prUrl = extractPRUrl();
  if (!prUrl) {
    console.log("[Content] Not on a GitHub PR page, skipping attach");
    return;
  }

  const host = document.createElement("div");
  host.id = ANALYZE_BUTTON_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    button { background: #22c55e; color: #0b1120; border: none; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; }
    button:disabled { background: #94a3b8; cursor: not-allowed; }
    button:hover:not(:disabled) { background: #16a34a; }
    .status { color: #06b6d4; font-size: 12px; margin-left: 8px; display: inline-block; }
    .offline { color: #ef4444; }
    .error { color: #f97316; }
    .success { color: #22c55e; }
  `;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.textContent = "Analyze PR";
  btn.title = "Analyze this PR with PR Sentinel";
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

  const target = findHeaderTarget();
  if (target) {
    target.appendChild(host);
    console.log("[Content] Injected PR Sentinel analyze button");
  }
}

function findHeaderTarget(): HTMLElement | null {
  for (const selector of HEADER_SELECTORS) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) return el;
  }
  return null;
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
  }
});

const observer = new MutationObserver(() => attachShadowUi());
observer.observe(document.documentElement, { childList: true, subtree: true });

attachShadowUi();
