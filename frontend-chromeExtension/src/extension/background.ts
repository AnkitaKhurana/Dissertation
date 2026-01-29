import { apiClient } from "../services/api";
import { loadPreference, loadSessionValue, savePreference } from "../services/storage";
import { AnalyzeResponse, ExtensionMessage, JobStatusPayload } from "./types";

const BACKOFF_MS = [1000, 2000, 5000, 10000];

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (!navigator.onLine) {
    sendResponse({ type: "OFFLINE" });
    return true;
  }

  if (message.type === "ANALYZE_PR") {
    handleAnalyze(message.prUrl).then((res) => sendResponse(res));
    return true; // keep channel open
  }

  if (message.type === "GET_STATUS") {
    handleStatusPoll(message.jobId).then((res) => sendResponse(res));
    return true;
  }

  return false;
});

async function handleAnalyze(prUrl: string): Promise<AnalyzeResponse> {
  const apiHost = await loadPreference<string>("apiHost");
  const apiKey = (await loadSessionValue<string>("apiKey")) || undefined;
  const response = await apiClient.createJob(prUrl, apiHost || undefined, apiKey);
  persistRecentJob({ jobId: response.job_id, status: response.status, last_updated: response.created_at });
  pollJob(response.job_id, apiHost, apiKey);
  return { jobId: response.job_id, status: response.status, progress: response.progress, last_updated: response.created_at };
}

async function handleStatusPoll(jobId: string): Promise<JobStatusPayload> {
  const apiHost = await loadPreference<string>("apiHost");
  const apiKey = (await loadSessionValue<string>("apiKey")) || undefined;
  const status = await apiClient.getJobStatus(jobId, apiHost || undefined, apiKey);
  return {
    jobId: status.job_id,
    status: status.status,
    progress: status.progress,
    results_so_far: status.results_so_far,
    last_updated: status.last_updated,
    error: status.error,
  };
}

async function pollJob(jobId: string, apiHost?: string, apiKey?: string | null) {
  for (const delay of BACKOFF_MS) {
    await wait(delay);
    try {
      const status = await apiClient.getJobStatus(jobId, apiHost || undefined, apiKey || undefined);
      const payload: JobStatusPayload = {
        jobId: status.job_id,
        status: status.status,
        progress: status.progress,
        results_so_far: status.results_so_far,
        last_updated: status.last_updated,
        error: status.error,
      };
      chrome.runtime.sendMessage({ type: "JOB_STATUS_UPDATE", ...payload });
      if (["completed", "failed", "cancelled"].includes(status.status)) {
        persistRecentJob(payload);
        break;
      }
    } catch (err) {
      console.error("Polling error", err);
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
