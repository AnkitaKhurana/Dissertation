import { ANALYZE_BUTTON_ID } from "../constants/selectors";
import { sendMessage } from "../utils/messaging";
import { ExtensionMessage } from "./types";

const HEADER_SELECTORS = [".gh-header-actions", "[data-testid='pr-header-actions']", "#partial-discussion-header .d-flex"];

export function attachShadowUi(): void {
  if (document.getElementById(ANALYZE_BUTTON_ID)) return;

  const host = document.createElement("div");
  host.id = ANALYZE_BUTTON_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    button { background: #22c55e; color: #0b1120; border: none; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: 700; }
    button:disabled { background: #94a3b8; cursor: not-allowed; }
    .offline { color: #ef4444; font-size: 12px; margin-left: 8px; }
  `;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.textContent = "Analyze with PR Sentinel";
  shadow.appendChild(btn);

  const status = document.createElement("span");
  status.className = "offline";
  status.textContent = "";
  shadow.appendChild(status);

  btn.addEventListener("click", async () => {
    const prUrl = window.location.href;
    const response = await sendMessage({ type: "ANALYZE_PR", prUrl });
    if ((response as any)?.type === "OFFLINE") {
      status.textContent = "Offline";
      return;
    }
    status.textContent = "Started";
  });

  window.addEventListener("offline", () => {
    status.textContent = "Offline";
    btn.disabled = true;
  });

  window.addEventListener("online", () => {
    status.textContent = "";
    btn.disabled = false;
  });

  const target = findHeaderTarget();
  if (target) {
    target.appendChild(host);
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
    const statusNode = shadowHost?.shadowRoot?.querySelector(".offline");
    if (statusNode) {
      statusNode.textContent = `Status: ${message.status}`;
    }
  }
});

const observer = new MutationObserver(() => attachShadowUi());
observer.observe(document.documentElement, { childList: true, subtree: true });

attachShadowUi();
