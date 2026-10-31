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

describe("role-based dashboards and navigation", () => {
  it("redirects a regular user session to the User Dashboard", async () => {
    seedSession("user");
    render(<App />);

    expect(await screen.findByTestId("user-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("admin-dashboard")).toBeNull();
    expect(screen.queryByTestId("staff-dashboard")).toBeNull();
    expect(await screen.findByText("User Dashboard")).toBeTruthy();
  });

  it("redirects a staff session to the Staff Dashboard", async () => {
    seedSession("staff");
    render(<App />);

    expect(await screen.findByTestId("staff-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("admin-dashboard")).toBeNull();
    expect(screen.queryByTestId("user-dashboard")).toBeNull();
    expect(await screen.findByText("Staff Dashboard")).toBeTruthy();
    expect(screen.getByText("Assigned to Me")).toBeTruthy();
  });

  it("redirects an admin session to the Admin Dashboard", async () => {
    seedSession("admin");
    render(<App />);

    expect(await screen.findByTestId("admin-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("staff-dashboard")).toBeNull();
    expect(screen.queryByTestId("user-dashboard")).toBeNull();
    expect(await screen.findByText("Admin Dashboard")).toBeTruthy();
  });

  it("hides unassigned-queue navigation from staff", async () => {
    seedSession("staff");
    render(<App />);
    await screen.findByTestId("staff-dashboard");

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.queryByTestId("menu-unassigned")).toBeNull();
    expect(screen.getByTestId("menu-queue")).toBeTruthy();
  });

  it("keeps unassigned-queue and users navigation for admin", async () => {
    seedSession("admin");
    render(<App />);
    await screen.findByTestId("admin-dashboard");

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByTestId("menu-unassigned")).toBeTruthy();
    expect(screen.getByTestId("menu-users")).toBeTruthy();
  });

  it("opens staff unassigned route as access denied", async () => {
    seedSession("staff");
    render(<App initialPage="unassigned" />);

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(
      screen.getByText("Your account does not have permission to view this page.")
    ).toBeTruthy();
  });

  it("hides New Complaint from staff navigation menu while keeping it for user and admin", async () => {
    seedSession("staff");
    const { unmount } = render(<App />);
    await screen.findByTestId("staff-dashboard");

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.queryByTestId("menu-compose")).toBeNull();
    unmount();

    seedSession("user");
    const userRender = render(<App />);
    await screen.findByTestId("user-dashboard");
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByTestId("menu-compose")).toBeTruthy();
    userRender.unmount();

    seedSession("admin");
    render(<App />);
    await screen.findByTestId("admin-dashboard");
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByTestId("menu-compose")).toBeTruthy();
  });

  it("prevents staff from accessing the compose page directly with access denied", async () => {
    seedSession("staff");
    render(<App initialPage="compose" />);

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(
      screen.getByText("Your account does not have permission to view this page.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit Complaint" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));
    expect(await screen.findByTestId("staff-dashboard")).toBeTruthy();
  });

  it("allows regular user and admin to access compose page directly", async () => {
    seedSession("user");
    const { unmount } = render(<App initialPage="compose" />);
    expect(
      await screen.findByRole("button", { name: "Submit Complaint" })
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Example: Internet not working")).toBeTruthy();
    unmount();

    seedSession("admin");
    render(<App initialPage="compose" />);
    expect(
      await screen.findByRole("button", { name: "Submit Complaint" })
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Example: Internet not working")).toBeTruthy();
  });

  it("hides + New Complaint button from ComplaintsPage for staff but displays it for regular users", async () => {
    seedSession("staff");
    const { unmount } = render(<App initialPage="complaints" />);
    expect(await screen.findByRole("heading", { name: "My Complaints" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+ new complaint/i })).toBeNull();
    unmount();

    seedSession("user");
    render(<App initialPage="complaints" />);
    expect(await screen.findByRole("heading", { name: "My Complaints" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /\+ new complaint/i })).toBeTruthy();
  });
});
