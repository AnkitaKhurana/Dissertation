const DEFAULT_API_BASE = "https://api.example.com";

import { authService } from "./auth";
import {
  JobResponse,
  JobDetailResponse,
  JobListResponse,
} from "../types/backend";

/**
 * Helper to get headers with JWT token
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await authService.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Helper to parse error responses
 */
async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const data = await res.json();
    console.warn("[API] Error response:", { status: res.status, data });
    return data.detail || data.error || data.message || `API error ${res.status}`;
  } catch {
    console.warn("[API] Failed to parse error response, status:", res.status, res.statusText);
    return `API error ${res.status}: ${res.statusText}`;
  }
}

export const apiClient = {
  async createJob(prUrl: string, apiHost?: string, agents?: string[]): Promise<JobResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();
    const url = `${base}/analyze-pr`;
    
    console.log("[API] Creating job:", { url, prUrl, agents, headers });

    // Normalize PR URL by removing /changes, /files, or other suffixes
    const normalizedUrl = prUrl.replace(/\/(changes|files|commits|comments|checks|reviews).*$/, "");

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        pr_url: normalizedUrl,
        agents_requested: agents || ["code_review"],
        sync: false, // Use async for large PRs
      }),
      credentials: "include",
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new Error(errorMsg);
    }

    return res.json();
  },

  async getJobStatus(jobId: string, apiHost?: string): Promise<JobDetailResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();

    const res = await fetch(`${base}/jobs/${jobId}`, {
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new Error(errorMsg);
    }

    return res.json();
  },

  async listJobs(apiHost?: string, page = 1, limit = 10): Promise<JobListResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();

    const res = await fetch(`${base}/jobs?page=${page}&limit=${limit}`, {
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new Error(errorMsg);
    }

    return res.json();
  },

  async cancelJob(jobId: string, apiHost?: string): Promise<JobDetailResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();

    const res = await fetch(`${base}/jobs/${jobId}/cancel`, {
      method: "PATCH",
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new Error(errorMsg);
    }

    return res.json();
  },

  async getHealth(apiHost?: string): Promise<{ status: string }> {
    const base = apiHost || DEFAULT_API_BASE;

    const res = await fetch(`${base}/health`);

    if (!res.ok) {
      throw new Error(`Health check failed: ${res.statusText}`);
    }

    return res.json();
  },
};
