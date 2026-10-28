import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

vi.mock("../api.js", () => ({
  getAnalytics: vi.fn(),
  downloadReportCsv: vi.fn(),
}));

import * as api from "../api.js";
import AnalyticsPage from "../pages/AnalyticsPage.jsx";

const session = { token: "test-token", username: "casey", role: "staff", userId: 1 };

function buildTrend() {
  const points = [];
  const today = new Date();
  for (let offset = 29; offset >= 0; offset -= 1) {
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

const staffPayload = {
  scope: "staff",
  generated_at: "2026-10-28T12:00:00Z",
  totals: {
    total: 12,
    open: 4,
    in_progress: 3,
    resolved: 3,
    closed: 2,
    unassigned: 5,
  },
  by_priority: { Low: 2, Medium: 5, High: 3, Urgent: 2 },
  by_category: {
    "IT & Systems": 6,
    "Facilities & Maintenance": 2,
    General: 4,
  },
  by_sentiment: { Escalated: 2, Frustrated: 3, Neutral: 5, Positive: 2 },
  resolution: {
    resolved_count: 5,
    total_count: 12,
    resolution_rate: 0.4167,
    avg_resolution_hours: 18.5,
  },
  trend: buildTrend(),
  my_workload: { active_count: 2, total_count: 4, resolved_count: 2 },
  staff_workload: [
    {
      id: 1,
      username: "sam",
      full_name: "Sam Lee",
      active_count: 3,
      total_count: 5,
      resolved_count: 2,
    },
    {
      id: 2,
      username: "alex",
      full_name: "Alex Kim",
      active_count: 1,
      total_count: 2,
      resolved_count: 1,
    },
  ],
};

const userPayload = {
  ...staffPayload,
  scope: "user",
  totals: { total: 3, open: 2, in_progress: 0, resolved: 1, closed: 0, unassigned: 1 },
  my_workload: null,
  staff_workload: [],
};

function renderPage(roleSession = session) {
  const notify = vi.fn();
  const handleError = vi.fn();
  render(
    <AnalyticsPage session={roleSession} notify={notify} handleError={handleError} />
  );
  return { notify, handleError };
}

beforeEach(() => {
  api.getAnalytics.mockResolvedValue(staffPayload);
  api.downloadReportCsv.mockResolvedValue("id,title\n1,Sample\n");
});

describe("AnalyticsPage with live backend data", () => {
  it("renders status, category, priority, trend, and workload from the API payload", async () => {
    renderPage();

    await waitFor(() =>
      expect(api.getAnalytics).toHaveBeenCalledWith("test-token")
    );

    expect(screen.getByTestId("analytics-scope").textContent).toContain(
      "All complaints"
    );

    // Stat cards
    expect(screen.getAllByText("Total").length).toBeGreaterThan(0);
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("Resolution Rate")).toBeTruthy();

    // Breakdowns
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getByText("Sentiment")).toBeTruthy();
    expect(screen.getByText("IT & Systems")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();

    // Trend window
    expect(screen.getByText("Trends")).toBeTruthy();
    expect(
      screen.getByText(/Created vs resolved over the last 14 days/)
    ).toBeTruthy();

    // Staff workload from real rows
    expect(screen.getByTestId("staff-workload")).toBeTruthy();
    expect(screen.getByText("Sam Lee")).toBeTruthy();
    expect(screen.getByText("Alex Kim")).toBeTruthy();
    expect(screen.getByTestId("my-workload")).toBeTruthy();
  });

  it("scopes the report for standard users and hides staff-only panels", async () => {
    api.getAnalytics.mockResolvedValue(userPayload);
    renderPage({ ...session, role: "user" });

    await waitFor(() =>
      expect(screen.getByTestId("analytics-scope").textContent).toContain(
        "Your complaints"
      )
    );

    expect(screen.queryByText("Unassigned")).toBeNull();
    expect(screen.queryByTestId("staff-workload")).toBeNull();
    expect(screen.queryByTestId("my-workload")).toBeNull();
    expect(api.getAnalytics).toHaveBeenCalledWith("test-token");
  });

  it("offers a CSV export backed by the reports endpoint", async () => {
    const { notify, handleError } = renderPage();

    await waitFor(() => expect(screen.getByText("Export CSV")).toBeTruthy());

    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      fireEvent.click(screen.getByText("Export CSV"));
      await waitFor(() =>
        expect(api.downloadReportCsv).toHaveBeenCalledWith("test-token")
      );
      await waitFor(() =>
        expect(notify).toHaveBeenCalledWith("success", "Report downloaded.")
      );
      expect(handleError).not.toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("surfaces API failures instead of showing fake numbers", async () => {
    const failure = new Error("boom");
    api.getAnalytics.mockRejectedValue(failure);

    const { handleError } = renderPage();

    await waitFor(() =>
      expect(screen.getByText("Analytics unavailable.")).toBeTruthy()
    );
    expect(handleError).toHaveBeenCalledWith(failure);
    expect(screen.queryByText("Staff Workload")).toBeNull();
  });

  it("keeps the loading state until real data arrives", async () => {
    let resolveRequest;
    api.getAnalytics.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    renderPage();
    expect(screen.getByText("Loading analytics...")).toBeTruthy();

    await act(async () => {
      resolveRequest(staffPayload);
    });
  });
});
