import { apiClient } from "../services/api";
import { loadPreference, loadSessionValue, savePreference } from "../services/storage";
import { AnalyzeResponse, ExtensionMessage, JobStatusPayload } from "./types";

const BACKOFF_MS = [1000, 2000, 5000, 10000, 15000, 20000, 30000];  // Poll for up to ~83 seconds

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (!navigator.onLine) {
    sendResponse({ type: "OFFLINE" });
    return true;
  }

  if (message.type === "ANALYZE_PR") {
    handleAnalyze(message.prUrl, message.agents).then((res) => sendResponse(res));
    return true; // keep channel open
  }

  if (message.type === "GET_STATUS") {
    handleStatusPoll(message.jobId).then((res) => sendResponse(res));
    return true;
  }

  return false;
});

async function handleAnalyze(prUrl: string, agents?: string[]): Promise<AnalyzeResponse> {
  try {
    const apiHost = await loadPreference<string>("backendUrl");
    console.log("[Background] Creating job with apiHost:", apiHost);
    const response = await apiClient.createJob(prUrl, apiHost || undefined, agents);
    console.log("[Background] API Response:", JSON.stringify(response, null, 2));
    
    if (!response || !response.job_id) {
      throw new Error("No job_id in response");
    }
    
    console.log("[Background] Job created:", response.job_id);
    await persistRecentJob({
      jobId: response.job_id,
      status: response.status,
      progress: response.progress,
      results_so_far: response.results_so_far,
      last_updated: response.created_at,
    });
    // Start polling in background (don't await, let it run async)
    void pollJob(response.job_id, apiHost);
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
    const status = await apiClient.getJobStatus(jobId, apiHost || undefined);
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
  console.log("[Background] Starting job poll for:", jobId);
  for (const delay of BACKOFF_MS) {
    await wait(delay);
    try {
      const status = await apiClient.getJobStatus(jobId, apiHost || undefined);
      const payload: JobStatusPayload = {
        jobId: status.job_id,
        status: status.status,
        progress: status.progress,
        results_so_far: status.results_so_far,
        last_updated: status.last_updated,
        error: status.error,
      };
      // Try to send update to all tabs (in case content script is on a different tab)
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: "JOB_STATUS_UPDATE", ...payload }).catch(() => {
              // Silently ignore - content script may not be active on this tab
            });
          }
        });
      });
      if (["completed", "failed", "cancelled"].includes(status.status)) {
        console.log("[Background] Job poll completed with status:", status.status);
        await persistRecentJob(payload);
        break;
      }
    } catch (err) {
      console.error("[Background] Polling error:", err);
    }
  }
}

async function persistRecentJob(job: JobStatusPayload) {
  const existing = (await loadPreference<JobStatusPayload[]>("recentJobs")) || [];
  const next = [job, ...existing].slice(0, 3);
  await savePreference("recentJobs", next as any);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
