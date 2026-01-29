import { apiClient } from "../services/api";

describe("apiClient", () => {
  it("calls analyze endpoint", async () => {
    const mockResponse = {
      job_id: "123",
      status: "completed",
      status_url: "/api/v1/jobs/123",
      results_so_far: [],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const res = await apiClient.createJob("https://github.com/org/repo/pull/1", "https://api.test");
    expect(res.job_id).toBe("123");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/api/v1/analyze-pr",
      expect.objectContaining({ method: "POST" })
    );
  });
});
