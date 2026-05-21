import { apiClient } from "../services/api";

const installFetchMock = () => {
  const fetchMock = jest.fn();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
  return fetchMock as jest.Mock;
};

describe("apiClient", () => {
  beforeEach(() => {
    installFetchMock();
  });

  describe("listJobs", () => {
    it("should fetch jobs with pagination params", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              job_id: "job-1",
              pr_url: "https://github.com/owner/repo/pull/123",
              status: "completed",
              progress: 1.0,
              findings_count: 2,
              created_at: new Date().toISOString(),
            },
          ],
          pagination: { page: 1, limit: 10, total: 1 },
        }),
      });

      const result = await apiClient.listJobs("http://localhost:3000", 1, 10);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/jobs?page=1&limit=10",
        expect.any(Object)
      );
    });
  });

  describe("getJobStatus", () => {
    it("should fetch job details by ID", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          job_id: "job-1",
          status: "completed",
          progress: 1.0,
          results_so_far: [
            {
              id: "f1",
              file_path: "src/app.ts",
              line_number: 42,
              severity: "high",
              message: "Unused variable",
              suggested_code: "// Remove",
            },
          ],
          last_updated: new Date().toISOString(),
        }),
      });

      const result = await apiClient.getJobStatus("job-1", "http://localhost:3000");

      expect(result.job_id).toBe("job-1");
      expect(Array.isArray(result.results_so_far)).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/jobs/job-1",
        expect.any(Object)
      );
    });
  });

  describe("createJob", () => {
    it("should create a new job analysis", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          job_id: "job-new",
          status: "pending",
        }),
      });

      const result = await apiClient.createJob("https://github.com/owner/repo/pull/123", "http://localhost:3000");

      expect(result.job_id).toBeDefined();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/analyze-pr",
        expect.objectContaining({method: "POST"})
      );
    });
  });

  describe("cancelJob", () => {
    it("should cancel a running job", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          job_id: "job-1",
          status: "cancelled",
        }),
      });

      const result = await apiClient.cancelJob("job-1", "http://localhost:3000");

      expect(result.status).toBe("cancelled");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/jobs/job-1/cancel",
        expect.objectContaining({method: "PATCH"})
      );
    });
  });

  describe("error handling", () => {
    it("should throw error on API failure", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({}),
      });

      await expect(apiClient.listJobs("http://localhost:3000", 1, 10))
        .rejects.toThrow();
    });
  });
});
