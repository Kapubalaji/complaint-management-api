import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../api.js", () => ({
  getComplaints: vi.fn(),
  listStaff: vi.fn(),
  getAnalytics: vi.fn(),
  downloadReportCsv: vi.fn(),
  adminListUsers: vi.fn(),
  getUnassigned: vi.fn(),
  getAssignedToMe: vi.fn(),
}));

import * as api from "../api.js";
import App from "../App.jsx";

const analyticsPayload = {
  scope: "user",
  generated_at: "2026-10-28T12:00:00Z",
  totals: { total: 2, open: 1, in_progress: 0, resolved: 1, closed: 0, unassigned: 1 },
  by_priority: { Low: 0, Medium: 2, High: 0, Urgent: 0 },
  by_category: { General: 2 },
  by_sentiment: { Neutral: 2 },
  resolution: {
    resolved_count: 1,
    total_count: 2,
    resolution_rate: 0.5,
    avg_resolution_hours: 4,
  },
  trend: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-10-${String((index % 28) + 1).padStart(2, "0")}`,
    created: index === 29 ? 1 : 0,
    resolved: index === 29 ? 1 : 0,
  })),
  my_workload: null,
  staff_workload: [],
};

function seedSession(role = "user") {
  sessionStorage.setItem("access_token", "session-token");
  sessionStorage.setItem("username", "casey");
  sessionStorage.setItem("user_role", role);
  sessionStorage.setItem("user_id", "7");
}

beforeEach(() => {
  sessionStorage.clear();
  api.getComplaints.mockResolvedValue([]);
  api.listStaff.mockResolvedValue([]);
  api.getAnalytics.mockResolvedValue(analyticsPayload);
  api.adminListUsers.mockResolvedValue([]);
  api.getUnassigned.mockResolvedValue([]);
  api.getAssignedToMe.mockResolvedValue([]);
});

afterEach(() => {
  sessionStorage.clear();
});

describe("App mobile navigation", () => {
  it("renders the dashboard for an authenticated session", async () => {
    seedSession();
    render(<App />);

    expect(await screen.findByText("Welcome back, casey!")).toBeTruthy();
    expect(screen.getByLabelText("Open navigation menu")).toBeTruthy();
    expect(screen.getByLabelText("Open navigation menu").getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("opens and closes the collapsible sidebar drawer", async () => {
    seedSession();
    render(<App />);
    await screen.findByText("Welcome back, casey!");

    const toggle = screen.getByLabelText("Open navigation menu");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".sidebar").className).toContain("open");
    expect(document.querySelector(".sidebar-backdrop")).toBeTruthy();

    fireEvent.click(document.querySelector(".sidebar-backdrop"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".sidebar").className).not.toContain("open");
  });

  it("navigates to analytics from the drawer and collapses it", async () => {
    seedSession();
    render(<App />);
    await screen.findByText("Welcome back, casey!");

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    fireEvent.click(screen.getByTestId("menu-analytics"));

    expect(await screen.findByText("Export CSV")).toBeTruthy();
    expect(api.getAnalytics).toHaveBeenCalledWith("session-token");
    expect(document.querySelector(".sidebar").className).not.toContain("open");
    expect(
      screen.getByLabelText("Open navigation menu").getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("closes the drawer with the Escape key", async () => {
    seedSession();
    render(<App />);
    await screen.findByText("Welcome back, casey!");

    const toggle = screen.getByLabelText("Open navigation menu");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps admin-only navigation out of the user menu", async () => {
    seedSession("user");
    render(<App />);
    await screen.findByText("Welcome back, casey!");

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.queryByTestId("menu-users")).toBeNull();
    expect(screen.getByTestId("menu-analytics")).toBeTruthy();
  });

  it("shows the user management page for admins", async () => {
    seedSession("admin");
    render(<App />);
    await waitFor(() => expect(api.listStaff).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    fireEvent.click(screen.getByTestId("menu-users"));
    const matches = await screen.findAllByText("User Management");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
