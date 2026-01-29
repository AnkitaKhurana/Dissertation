const DEFAULT_API_BASE = "https://api.example.com";

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

export const apiClient = {
  async createJob(prUrl: string, apiHost?: string, token?: string): Promise<CreateJobResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const res = await fetch(`${base}/api/v1/analyze-pr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ pr_url: prUrl, agents_requested: ["code_review"], sync: true }),
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    return res.json();
  },

  async getJobStatus(jobId: string, apiHost?: string, token?: string): Promise<JobStatusResponse> {
    const base = apiHost || DEFAULT_API_BASE;
    const res = await fetch(`${base}/api/v1/jobs/${jobId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    return res.json();
  },
};
