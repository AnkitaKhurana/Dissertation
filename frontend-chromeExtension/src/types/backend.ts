/**
 * Generated TypeScript types mirroring backend Pydantic schemas
 * Source: backend/app/schemas/*.py
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  file_path: string;
  line_number: number;
  severity: Severity;
  agent: string;
  message: string;
  suggested_code?: string | null;
  confidence: number;
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobCreate {
  pr_url: string;
  agents_requested?: string[];
  sync?: boolean;
  idempotency_key?: string | null;
}

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  status_url: string;
  created_at?: string;
  results_so_far?: Finding[];
  progress?: number;
}

export interface JobDetailResponse {
  job_id: string;
  status: JobStatus;
  progress: number;
  last_updated: string;
  results_so_far: Finding[];
  error?: string | null;
}

export interface JobSummary {
  job_id: string;
  pr_url: string;
  status: JobStatus;
  created_at: string;
  last_updated: string;
  progress: number;
  findings_count: number;
  error?: string | null;
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface JobListResponse {
  data: JobSummary[];
  pagination: PaginationMetadata;
}

export interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserPreferences {
  theme: "light" | "dark";
  llm_priority: string[];
  agents_enabled: string[];
  severity_display: "all" | "critical_high" | "critical_high_medium";
  job_retention_days: number;
}
