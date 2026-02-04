const DEFAULT_API_BASE = "https://api.example.com";

import { authService } from "./auth";

interface CreateJobResponse {
  job_id: string;
  status: string;
  status_url: string;
  created_at?: string;
  results_so_far?: unknown[];
  progress?: number;
}

interface JobStatusResponse {
  job_id: string;
  status: string;
  results_so_far?: unknown[];
  progress?: number;
  last_updated?: string;
  error?: string | null;
}

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
  async createJob(prUrl: string, apiHost?: string, agents?: string[]): Promise<CreateJobResponse> {
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

  async getJobStatus(jobId: string, apiHost?: string): Promise<JobStatusResponse> {
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

  async listJobs(apiHost?: string, limit = 10, skip = 0): Promise<{ jobs: JobStatusResponse[]; total: number }> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();

    const res = await fetch(`${base}/jobs?limit=${limit}&skip=${skip}`, {
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new Error(errorMsg);
    }

    return res.json();
  },

  async cancelJob(jobId: string, apiHost?: string): Promise<{ success: boolean }> {
    const base = apiHost || DEFAULT_API_BASE;
    const headers = await getAuthHeaders();

    const res = await fetch(`${base}/jobs/${jobId}/cancel`, {
      method: "POST",
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
