import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../api.js", () => ({
  getAnalytics: vi.fn(),
  downloadReportCsv: vi.fn(),
}));

import * as api from "../api.js";
import AnalyticsPage from "../pages/AnalyticsPage.jsx";

const session = { token: "test-token", username: "casey", role: "staff", userId: 1 };

function buildTrend(days = 30) {
  const points = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    points.push({
      date: day.toISOString().slice(0, 10),
      created: offset % 3,
      resolved: offset % 2,
    });
  }
  return points;
}

const payload = {
  scope: "staff",
  generated_at: "2026-10-28T12:00:00Z",
  totals: { total: 4, open: 2, in_progress: 1, resolved: 1, closed: 0, unassigned: 1 },
  by_priority: { Low: 1, Medium: 2, High: 1, Urgent: 0 },
  by_category: { General: 4 },
  by_sentiment: { Neutral: 4 },
  resolution: {
    resolved_count: 1,
    total_count: 4,
    resolution_rate: 0.25,
    avg_resolution_hours: 12,
  },
  trend: buildTrend(30),
  my_workload: { active_count: 1, total_count: 2, resolved_count: 1 },
  staff_workload: [],
};

function renderPage() {
  const notify = vi.fn();
  const handleError = vi.fn();
  render(
    <AnalyticsPage session={session} notify={notify} handleError={handleError} />
  );
  return { notify, handleError };
}

function stubDownload() {
  const createObjectURL = vi.fn(() => "blob:report");
  const revokeObjectURL = vi.fn();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  return () => {
    clickSpy.mockRestore();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  };
}

beforeEach(() => {
  api.getAnalytics.mockResolvedValue(payload);
  api.downloadReportCsv.mockResolvedValue("id,title\n1,Sample\n");
});

describe("AnalyticsPage CSV export date range", () => {
  it("renders start and end date inputs next to the export button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Export CSV")).toBeTruthy());

    expect(screen.getByTestId("export-range")).toBeTruthy();
    expect(screen.getByLabelText("Export start date")).toBeTruthy();
    expect(screen.getByLabelText("Export end date")).toBeTruthy();
  });

  it("sends the selected date range to the export endpoint", async () => {
    const { notify, handleError } = renderPage();
    await waitFor(() => expect(screen.getByText("Export CSV")).toBeTruthy());

    const restore = stubDownload();
    try {
      fireEvent.change(screen.getByLabelText("Export start date"), {
        target: { value: "2026-10-01" },
      });
      fireEvent.change(screen.getByLabelText("Export end date"), {
        target: { value: "2026-10-15" },
      });
      fireEvent.click(screen.getByText("Export CSV"));

      await waitFor(() =>
        expect(api.downloadReportCsv).toHaveBeenCalledWith("test-token", {
          startDate: "2026-10-01",
          endDate: "2026-10-15",
        })
      );
      await waitFor(() =>
        expect(notify).toHaveBeenCalledWith("success", "Report downloaded.")
      );
      expect(handleError).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("exports the full report when no range is selected", async () => {
    const { notify, handleError } = renderPage();
    await waitFor(() => expect(screen.getByText("Export CSV")).toBeTruthy());

    const restore = stubDownload();
    try {
      fireEvent.click(screen.getByText("Export CSV"));

      await waitFor(() =>
        expect(api.downloadReportCsv).toHaveBeenCalledWith("test-token")
      );
      await waitFor(() =>
        expect(notify).toHaveBeenCalledWith("success", "Report downloaded.")
      );
      expect(handleError).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("rejects an inverted range before calling the API", async () => {
    const { handleError } = renderPage();
    await waitFor(() => expect(screen.getByText("Export CSV")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Export start date"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.change(screen.getByLabelText("Export end date"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByText("Export CSV"));

    await waitFor(() => expect(handleError).toHaveBeenCalledTimes(1));
    expect(handleError.mock.calls[0][0].message).toContain(
      "start date must be on or before"
    );
    expect(api.downloadReportCsv).not.toHaveBeenCalled();
  });

  it("labels the 14-day trend view against the 30-day API window", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Trends")).toBeTruthy()
    );
    const label = screen.getByText(/Created vs resolved over the last 14 days/);
    expect(label.textContent).toContain(
      "14-day view of the 30-day API window"
    );
  });
});
