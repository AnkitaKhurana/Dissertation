export type ExtensionMessage =
  | { type: "ANALYZE_PR"; prUrl: string; agents?: string[] }
  | { type: "GET_STATUS"; jobId: string }
  | { type: "JOB_STATUS_UPDATE"; jobId: string; status: string; progress?: number; results_so_far?: unknown[]; last_updated?: string }
  | { type: "OFFLINE" };

export interface AnalyzeResponse {
  jobId: string;
  status: string;
  progress?: number;
  last_updated?: string;
  error?: string;
}

export interface JobStatusPayload {
  jobId: string;
  status: string;
  progress?: number;
  results_so_far?: unknown[];
  last_updated?: string;
  error?: string | null;
}
