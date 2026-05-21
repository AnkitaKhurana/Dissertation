import { apiClient } from "../services/api";
import { loadPreference, savePreference } from "../services/storage";
import { AnalyzeResponse, ExtensionMessage, JobStatusPayload } from "./types";

// Keep polling long enough for larger repos/PRs.
// Increased intervals to reduce server load: slower initial checks, then poll every 30s for ~20 minutes.
const BACKOFF_MS = [
  2000,
  3000,
  5000,
  10000,
  15000,
  20000,
  ...new Array(40).fill(30000),
];

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Handle offline state
  if (!navigator.onLine) {
    sendResponse({ type: "OFFLINE" });
    return false;
  }

  // Handle ANALYZE_PR
  if (message.type === "ANALYZE_PR") {
    handleAnalyze(message.prUrl, message.agents)
      .then((res) => {
        try {
          sendResponse(res);
        } catch (e) {
          console.error("[Background] Failed to send analyze response:", e);
        }
      })
      .catch((err) => {
        console.error("[Background] handleAnalyze error:", err);
        try {
          sendResponse({ error: String(err), jobId: "", status: "failed", last_updated: new Date().toISOString() });
        } catch (e) {
          console.error("[Background] Failed to send error response:", e);
        }
      });
    return true; // Keep channel open for async response
  }

  // Handle GET_STATUS
  if (message.type === "GET_STATUS") {
    handleStatusPoll(message.jobId)
      .then((res) => {
        try {
          sendResponse(res);
        } catch (e) {
          console.error("[Background] Failed to send status response:", e);
        }
      })
      .catch((err) => {
        console.error("[Background] handleStatusPoll error:", err);
        try {
          sendResponse({ jobId: message.jobId, status: "error", error: String(err), last_updated: new Date().toISOString() });
        } catch (e) {
          console.error("[Background] Failed to send error response:", e);
        }
      });
    return true; // Keep channel open for async response
  }

  // Unhandled message type
  return false;
});

async function handleAnalyze(prUrl: string, agents?: string[]): Promise<AnalyzeResponse> {
  try {
    const apiHost = await loadPreference<string>("backendUrl");
    console.log("[Background] handleAnalyze start:", { prUrl, agents, apiHost });
    const response = await apiClient.createJob(prUrl, apiHost || undefined, agents);
    console.log("[Background] API Response:", JSON.stringify(response, null, 2));
    
    if (!response || !response.job_id) {
      throw new Error("No job_id in response");
    }
    
    console.log("[Background] Job created:", response.job_id, {
      status: response.status,
      progress: response.progress,
      hasResults: Array.isArray(response.results_so_far) ? response.results_so_far.length : 0,
    });
    await persistRecentJob({
      jobId: response.job_id,
      status: response.status,
      progress: response.progress,
      results_so_far: response.results_so_far,
      last_updated: response.created_at,
    });
    // Start polling in background (don't await, let it run async)
    console.log("[Background] Starting async poll loop for:", response.job_id);
    void pollJob(response.job_id, apiHost || undefined);
    return {
      jobId: response.job_id,
      status: response.status,
      progress: response.progress,
      last_updated: response.created_at,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Background] Analysis error:", errorMsg);
    console.error("[Background] Full error:", error);
    return {
      error: errorMsg,
      jobId: "",
      status: "failed",
      last_updated: new Date().toISOString(),
    };
  }
}

async function handleStatusPoll(jobId: string): Promise<JobStatusPayload> {
  try {
    const apiHost = await loadPreference<string>("backendUrl");
    console.log("[Background] handleStatusPoll start:", { jobId, apiHost });
    const status = await apiClient.getJobStatus(jobId, apiHost || undefined);
    console.log("[Background] handleStatusPoll response:", {
      jobId: status.job_id,
      status: status.status,
      progress: status.progress,
      results: Array.isArray(status.results_so_far) ? status.results_so_far.length : 0,
      error: status.error,
    });
    return {
      jobId: status.job_id,
      status: status.status,
      progress: status.progress,
      results_so_far: status.results_so_far,
      last_updated: status.last_updated,
      error: status.error,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fetch status";
    console.error("[Background] Status poll error:", errorMsg);
    return {
      jobId,
      status: "error",
      error: errorMsg,
      last_updated: new Date().toISOString(),
    };
  }
}

async function pollJob(jobId: string, apiHost?: string) {
  console.log("[Background] Starting job poll for:", { jobId, apiHost });
  for (const delay of BACKOFF_MS) {
    await wait(delay);
    try {
      console.log("[Background] Polling job status after delay:", { jobId, delay });
      const status = await apiClient.getJobStatus(jobId, apiHost || undefined);
      const payload: JobStatusPayload = {
        jobId: status.job_id,
        status: status.status,
        progress: status.progress,
        results_so_far: status.results_so_far,
        last_updated: status.last_updated,
        error: status.error,
      };
      console.log("[Background] Broadcasting job update:", {
        jobId: payload.jobId,
        status: payload.status,
        progress: payload.progress,
        results: Array.isArray(payload.results_so_far) ? payload.results_so_far.length : 0,
      });
      broadcastJobUpdate(payload);
      // Persist intermediate progress too, so popup fallback data stays fresh.
      await persistRecentJob(payload);

      if (["completed", "failed", "cancelled"].includes(status.status)) {
        console.log("[Background] Job poll completed with status:", status.status);
        return;
      }
    } catch (err) {
      console.error("[Background] Polling error:", err);
    }
  }

  // Final status fetch in case completion happened right after last interval.
  try {
    const finalStatus = await apiClient.getJobStatus(jobId, apiHost || undefined);
    console.log("[Background] Final poll status:", {
      jobId: finalStatus.job_id,
      status: finalStatus.status,
      progress: finalStatus.progress,
      results: Array.isArray(finalStatus.results_so_far) ? finalStatus.results_so_far.length : 0,
    });
    const payload: JobStatusPayload = {
      jobId: finalStatus.job_id,
      status: finalStatus.status,
      progress: finalStatus.progress,
      results_so_far: finalStatus.results_so_far,
      last_updated: finalStatus.last_updated,
      error: finalStatus.error,
    };
    broadcastJobUpdate(payload);
    await persistRecentJob(payload);
  } catch (err) {
    console.error("[Background] Final poll fetch failed:", err);
  }
}

async function persistRecentJob(job: JobStatusPayload) {
  const existing = (await loadPreference<JobStatusPayload[]>("recentJobs")) || [];
  const withoutCurrent = existing.filter((item) => item.jobId !== job.jobId);
  const next = [job, ...withoutCurrent].slice(0, 10);
  await savePreference("recentJobs", next as any);
}

function broadcastJobUpdate(payload: JobStatusPayload) {
  // Try to send update to all tabs (in case content script is on a different tab)
  chrome.tabs.query({}, (tabs) => {
    console.log("[Background] broadcastJobUpdate tabs:", tabs.length);
    tabs.forEach((tab) => {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: "JOB_STATUS_UPDATE", ...payload }, (_resp) => {
            const lastErr = chrome.runtime && (chrome.runtime as any).lastError;
            if (lastErr) {
              // Ignore errors when content script isn't present for a tab.
              console.debug("[Background] sendMessage ignored for tab", tab.id, lastErr.message);
            } else {
              console.log("[Background] sendMessage delivered to tab", tab.id, payload.status);
            }
          });
        } catch (sendErr) {
          console.warn("[Background] sendMessage failed for tab", tab.id, sendErr);
        }
      }
    });
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
