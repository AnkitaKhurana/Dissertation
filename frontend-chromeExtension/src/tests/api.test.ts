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

  it("calls analyze endpoint", async () => {
    const mockResponse = {
      job_id: "123",
      status: "completed",
      status_url: "/api/v1/jobs/123",
      results_so_far: [],
    };

    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const res = await apiClient.createJob("https://github.com/org/repo/pull/1", "https://api.test");
    expect(res.job_id).toBe("123");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.test/analyze-pr",
      expect.objectContaining({ method: "POST" })
    );
  });
});
