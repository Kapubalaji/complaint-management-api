import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadReportCsv, ApiError } from "../api.js";

describe("downloadReportCsv query building", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve("id,title\n1,Sample\n"),
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the export endpoint without params when no range is given", async () => {
    const csv = await downloadReportCsv("token-1");
    expect(csv).toContain("id,title");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.endsWith("/reports/export")).toBe(true);
    expect(url).not.toContain("start_date");
    expect(url).not.toContain("end_date");
    expect(options.headers.Authorization).toBe("Bearer token-1");
  });

  it("appends start_date and end_date when a range is given", async () => {
    await downloadReportCsv("token-1", {
      startDate: "2026-10-01",
      endDate: "2026-10-15",
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/reports/export?");
    expect(url).toContain("start_date=2026-10-01");
    expect(url).toContain("end_date=2026-10-15");
  });

  it("omits empty range values", async () => {
    await downloadReportCsv("token-1", { startDate: "2026-10-01" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("start_date=2026-10-01");
    expect(url).not.toContain("end_date");
  });

  it("surfaces API errors from the export endpoint", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: "start_date must be a valid date in YYYY-MM-DD format." }),
      })
    );
    await expect(downloadReportCsv("token-1", { startDate: "bad" })).rejects.toThrow(
      ApiError
    );
    await expect(downloadReportCsv("token-1", { startDate: "bad" })).rejects.toThrow(
      /YYYY-MM-DD/
    );
  });
});
