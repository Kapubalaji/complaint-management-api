import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ComplaintDetailsPage from "../pages/ComplaintDetailsPage.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  getComplaint: vi.fn(),
  updateComplaintStatus: vi.fn(),
  assignComplaint: vi.fn(),
  reanalyzeComplaint: vi.fn(),
  getComments: vi.fn(),
  addComment: vi.fn(),
}));

const complaint = {
  id: 12,
  title: "Printer offline",
  description: "Floor 2 printer is offline.",
  status: "open",
  category: "IT & Systems",
  priority: "Medium",
  user_id: 3,
  assigned_staff_id: 9,
  suggested_staff_id: 9,
  sentiment: "Neutral",
  ai_summary: "Printer issue.",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  resolved_at: null,
};

function session(role, userId = 7) {
  return {
    token: "session-token",
    username: "casey",
    role,
    userId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getComplaint.mockResolvedValue(complaint);
  api.getComments.mockResolvedValue([]);
});

describe("Complaint details assignment controls", () => {
  it("shows assignment panel for admin only", async () => {
    render(
      <ComplaintDetailsPage
        complaintId={12}
        token="session-token"
        session={session("admin")}
        staffMap={{ 9: "Sam" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("assignment-panel")).toBeTruthy()
    );
    expect(screen.getByLabelText("Assign to")).toBeTruthy();
  });

  it("hides assignment panel for staff but keeps status updates", async () => {
    render(
      <ComplaintDetailsPage
        complaintId={12}
        token="session-token"
        session={session("staff", 9)}
        staffMap={{ 9: "Sam" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getAllByText("Update Status").length).toBeGreaterThan(0)
    );
    expect(screen.queryByTestId("assignment-panel")).toBeNull();
    expect(screen.queryByLabelText("Assign to")).toBeNull();
  });

  it("hides workflow and assignment controls for regular users", async () => {
    render(
      <ComplaintDetailsPage
        complaintId={12}
        token="session-token"
        session={session("user", 3)}
        staffMap={{}}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByText("Need a status change?")).toBeTruthy()
    );
    expect(screen.queryByTestId("assignment-panel")).toBeNull();
    expect(screen.queryByText("Update Status")).toBeNull();
  });
});
