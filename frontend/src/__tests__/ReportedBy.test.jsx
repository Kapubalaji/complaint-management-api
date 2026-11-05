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

const baseComplaint = {
  id: 42,
  title: "Network connectivity outage",
  description: "3rd floor switches unresponsive.",
  status: "open",
  category: "IT & Systems",
  priority: "High",
  user_id: 101,
  assigned_staff_id: 202,
  suggested_staff_id: 202,
  sentiment: "Urgent",
  ai_summary: "Network outage on 3rd floor.",
  created_at: "2026-11-01T09:30:00Z",
  updated_at: "2026-11-01T09:30:00Z",
  resolved_at: null,
  reporter: {
    id: 101,
    username: "alice_creator",
    full_name: "Alice Cooper",
  },
};

function makeSession(role, userId = 1) {
  return {
    token: "valid-jwt-token",
    username: `user_${role}`,
    role,
    userId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getComments.mockResolvedValue([]);
});

describe("ComplaintDetailsPage - Reported By Section", () => {
  it("displays original creator username and full name to Admin", async () => {
    api.getComplaint.mockResolvedValue(baseComplaint);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("admin")}
        staffMap={{ 202: "Bob Technician" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const card = screen.getByTestId("reported-by-card");
    expect(card.textContent).toContain("Reported By");
    expect(card.textContent).toContain("Alice Cooper");
    expect(card.textContent).toContain("alice_creator");
    // Ensure avatar uses initial of full_name or username
    expect(card.textContent).toContain("A");
  });

  it("displays original creator username and full name to Staff", async () => {
    api.getComplaint.mockResolvedValue(baseComplaint);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("staff", 202)}
        staffMap={{ 202: "Bob Technician" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const card = screen.getByTestId("reported-by-card");
    expect(card.textContent).toContain("Alice Cooper");
    expect(card.textContent).toContain("alice_creator");
  });

  it("does not show Reported By section to regular Users", async () => {
    api.getComplaint.mockResolvedValue(baseComplaint);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("user", 101)}
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
      expect(screen.getByText(/Network connectivity outage/)).toBeTruthy()
    );

    expect(screen.queryByTestId("reported-by-card")).toBeNull();
    expect(screen.queryByText("Reported By")).toBeNull();
  });

  it("does not display the assigned technician as the reporter", async () => {
    api.getComplaint.mockResolvedValue(baseComplaint);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("admin")}
        staffMap={{ 202: "Bob Technician" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const reporterCard = screen.getByTestId("reported-by-card");
    expect(reporterCard.textContent).not.toContain("Bob Technician");
    expect(reporterCard.textContent).toContain("Alice Cooper");

    // The assigned technician appears in Assigned To card, not Reported By
    expect(screen.getByText("Assigned To")).toBeTruthy();
    expect(screen.getAllByText("Bob Technician").length).toBeGreaterThan(0);
  });

  it("handles missing full name gracefully by displaying the username", async () => {
    const complaintWithoutFullName = {
      ...baseComplaint,
      reporter: {
        id: 101,
        username: "solouser",
        full_name: null,
      },
    };
    api.getComplaint.mockResolvedValue(complaintWithoutFullName);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("admin")}
        staffMap={{ 202: "Bob Technician" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const card = screen.getByTestId("reported-by-card");
    expect(card.textContent).toContain("solouser");
    expect(card.textContent).toContain("Complaint Creator");
  });

  it("handles missing reporter data gracefully without throwing errors", async () => {
    const complaintWithoutReporter = {
      ...baseComplaint,
      reporter: null,
    };
    api.getComplaint.mockResolvedValue(complaintWithoutReporter);

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("admin")}
        staffMap={{ 202: "Bob Technician" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const card = screen.getByTestId("reported-by-card");
    expect(card.textContent).toContain("Reporter information unavailable.");
  });

  it("preserves original reporter across technician reassignments", async () => {
    api.getComplaint.mockResolvedValue(baseComplaint);
    api.assignComplaint.mockResolvedValue({
      ...baseComplaint,
      assigned_staff_id: 303, // Reassigned to a new technician
    });

    render(
      <ComplaintDetailsPage
        complaintId={42}
        token="valid-jwt-token"
        session={makeSession("admin")}
        staffMap={{ 202: "Bob Technician", 303: "Charlie Specialist" }}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        notify={() => {}}
        handleError={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reported-by-card")).toBeTruthy()
    );

    const reporterCard = screen.getByTestId("reported-by-card");
    expect(reporterCard.textContent).toContain("Alice Cooper");
    expect(reporterCard.textContent).toContain("alice_creator");
    expect(reporterCard.textContent).not.toContain("Charlie Specialist");
  });
});
