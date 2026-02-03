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
    const response = await apiClient.createJob(prUrl, apiHost || undefined, agents);
    console.log("[Background] Job created:", response.job_id);
    persistRecentJob({
      jobId: response.job_id,
      status: response.status,
      progress: response.progress,
      results_so_far: response.results_so_far,
      last_updated: response.created_at,
    });
    pollJob(response.job_id, apiHost);
    return {
      jobId: response.job_id,
      status: response.status,
      progress: response.progress,
      last_updated: response.created_at,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Background] Analysis error:", errorMsg);
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
      chrome.runtime.sendMessage({ type: "JOB_STATUS_UPDATE", ...payload }).catch((err) => {
        console.log("[Background] Could not send status update (content script not active)");
      });
      if (["completed", "failed", "cancelled"].includes(status.status)) {
        console.log("[Background] Job poll completed with status:", status.status);
        persistRecentJob(payload);
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
