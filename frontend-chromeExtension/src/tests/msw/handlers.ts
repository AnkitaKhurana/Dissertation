import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/api/v1/analyze-pr", async () => {
    return HttpResponse.json({ job_id: "job-1", status: "pending", status_url: "/api/v1/jobs/job-1" });
  }),
  http.get("/api/v1/jobs/:jobId", async ({ params }) => {
    return HttpResponse.json({
      job_id: params.jobId as string,
      status: "completed",
      progress: 1.0,
      results_so_far: [],
      last_updated: new Date().toISOString(),
    });
  }),
];
