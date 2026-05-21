import { rest } from "msw";

export const mockJobResponse = {
  job_id: "job-1",
  pr_url: "https://github.com/owner/repo/pull/123",
  status: "completed",
  progress: 1.0,
  findings_count: 2,
  created_at: new Date().toISOString(),
  last_updated: new Date().toISOString(),
  results_so_far: [
    {
      id: "finding-1",
      file_path: "src/app.ts",
      line_number: 42,
      severity: "high",
      message: "Unused variable 'foo'",
      suggested_code: "// Remove unused variable",
    },
    {
      id: "finding-2",
      file_path: "src/utils.ts",
      line_number: 10,
      severity: "medium",
      message: "Missing error handling",
      suggested_code: "try { ... } catch (e) { log(e); }",
    },
  ],
};

export const handlers = [
  // Analyze PR
  rest.post("/api/v1/analyze-pr", (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ job_id: "job-1", status: "pending", status_url: "/api/v1/jobs/job-1" }));
  }),

  // List jobs (GET /api/v1/jobs)
  rest.get("/api/v1/jobs", (req, res, ctx) => {
    const page = req.url.searchParams.get("page") || "1";
    const limit = req.url.searchParams.get("limit") || "10";
    return res(
      ctx.status(200),
      ctx.json({
        data: [mockJobResponse],
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 1 },
      })
    );
  }),

  // Get job by ID (GET /api/v1/jobs/:jobId)
  rest.get("/api/v1/jobs/:jobId", (req, res, ctx) => {
    return res(ctx.status(200), ctx.json(mockJobResponse));
  }),

  // Cancel job (PATCH /api/v1/jobs/:jobId)
  rest.patch("/api/v1/jobs/:jobId", (req, res, ctx) => {
    const jobId = req.params.jobId as string;
    return res(
      ctx.status(200),
      ctx.json({
        ...mockJobResponse,
        job_id: jobId || "job-1",
        status: "cancelled",
      })
    );
  }),

  // Auth endpoints (optional for basic integration)
  rest.get("/api/v1/auth/me", (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        gh_login: "testuser",
        github_username: "testuser",
        email: "test@example.com",
      })
    );
  }),
];

