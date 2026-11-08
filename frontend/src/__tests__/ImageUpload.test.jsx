import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ComplaintForm from "../components/ComplaintForm.jsx";
import ComplaintDetailsPage from "../pages/ComplaintDetailsPage.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  createComplaint: vi.fn(),
  patchComplaint: vi.fn(),
  previewAi: vi.fn(),
  getComplaint: vi.fn(),
  getComments: vi.fn().mockResolvedValue([]),
  uploadComplaintImages: vi.fn(),
  deleteComplaintImage: vi.fn(),
  updateComplaintStatus: vi.fn(),
  assignComplaint: vi.fn(),
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-preview");
global.URL.revokeObjectURL = vi.fn();

function makeSession(role = "user", userId = 1) {
  return {
    token: "test-token",
    username: `${role}_user`,
    role,
    userId,
  };
}

describe("ComplaintForm - Image Uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the upload dropzone and allows selecting an image", async () => {
    render(
      <ComplaintForm
        token="test-token"
        session={makeSession("user")}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        notify={vi.fn()}
      />
    );

    expect(screen.getByText(/Click to upload/i)).toBeTruthy();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["test-image-content"], "broken_window.png", {
      type: "image/png",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("broken_window.png")).toBeTruthy();
    });

    // Remove button works
    const removeBtn = screen.getByTitle("Remove image");
    fireEvent.click(removeBtn);

    expect(screen.queryByText("broken_window.png")).toBeNull();
  });

  it("shows an error when a file exceeds 5MB", async () => {
    render(
      <ComplaintForm
        token="test-token"
        session={makeSession("user")}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        notify={vi.fn()}
      />
    );

    const fileInput = document.querySelector('input[type="file"]');
    const hugeFile = new File(["a".repeat(100)], "huge.png", {
      type: "image/png",
    });
    Object.defineProperty(hugeFile, "size", { value: 6 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [hugeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/exceeds the 5MB size limit/i)).toBeTruthy();
    });
  });

  it("uploads selected images when complaint is submitted", async () => {
    const notifyMock = vi.fn();
    const onSavedMock = vi.fn();
    api.createComplaint.mockResolvedValue({ id: 101, title: "Water leak" });
    api.uploadComplaintImages.mockResolvedValue([
      { id: 1, image_url: "https://cloudinary.com/leak.png", image_type: "issue" },
    ]);

    render(
      <ComplaintForm
        token="test-token"
        session={makeSession("user")}
        onSaved={onSavedMock}
        onCancel={vi.fn()}
        notify={notifyMock}
      />
    );

    fireEvent.change(screen.getByLabelText(/Title/i), {
      target: { value: "Water leak" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Kitchen pipe is leaking water" },
    });

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["img-data"], "leak.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("leak.jpg")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Submit Complaint/i }));

    await waitFor(() => {
      expect(api.createComplaint).toHaveBeenCalledTimes(1);
      expect(api.uploadComplaintImages).toHaveBeenCalledWith(
        "test-token",
        101,
        [file],
        "issue",
        expect.any(Function)
      );
      expect(onSavedMock).toHaveBeenCalledWith({ id: 101, title: "Water leak" });
    });
  });
});

describe("ComplaintDetailsPage - Image Display & Repair Uploads", () => {
  const mockComplaintWithImages = {
    id: 55,
    title: "Broken AC",
    description: "AC is making loud rattling noise",
    status: "in_progress",
    category: "HVAC",
    priority: "High",
    user_id: 1,
    assigned_staff_id: 2,
    created_at: "2026-11-01T10:00:00Z",
    images: [
      {
        id: 11,
        complaint_id: 55,
        user_id: 1,
        image_url: "https://res.cloudinary.com/demo/issue1.png",
        original_filename: "rattling_unit.png",
        image_type: "issue",
        created_at: "2026-11-01T10:05:00Z",
      },
      {
        id: 12,
        complaint_id: 55,
        user_id: 2,
        image_url: "https://res.cloudinary.com/demo/repair1.png",
        original_filename: "motor_replaced.png",
        image_type: "repair",
        created_at: "2026-11-02T14:30:00Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resident views issue photos while repair completion photos are restricted to staff and admin", async () => {
    api.getComplaint.mockResolvedValue(mockComplaintWithImages);

    render(
      <ComplaintDetailsPage
        complaintId={55}
        token="test-token"
        session={makeSession("user", 1)}
        staffMap={{ 2: "Tech Alice" }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        notify={vi.fn()}
        handleError={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("rattling_unit.png")).toBeTruthy();
    });

    // Resident does not see repair completion photos or upload dropzone
    expect(screen.queryByText("motor_replaced.png")).toBeNull();
    expect(screen.queryByText(/Upload Proof of Repair/i)).toBeNull();
  });

  it("staff member sees repair upload dropzone and can upload repair photos", async () => {
    api.getComplaint.mockResolvedValue(mockComplaintWithImages);
    api.uploadComplaintImages.mockResolvedValue([
      {
        id: 13,
        complaint_id: 55,
        user_id: 2,
        image_url: "https://res.cloudinary.com/demo/repair2.png",
        original_filename: "completed_test.png",
        image_type: "repair",
        created_at: "2026-11-02T15:00:00Z",
      },
    ]);

    const notifyMock = vi.fn();

    render(
      <ComplaintDetailsPage
        complaintId={55}
        token="test-token"
        session={makeSession("staff", 2)}
        staffMap={{ 2: "Tech Alice" }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        notify={notifyMock}
        handleError={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Upload Proof of Repair/i)).toBeTruthy();
    });

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const repairFile = new File(["repair-bytes"], "completed_test.png", {
      type: "image/png",
    });

    fireEvent.change(fileInput, { target: { files: [repairFile] } });

    await waitFor(() => {
      expect(screen.getByText("completed_test.png")).toBeTruthy();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Upload 1 Repair Photo/i,
    });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(api.uploadComplaintImages).toHaveBeenCalledWith(
        "test-token",
        55,
        [repairFile],
        "repair",
        expect.any(Function)
      );
      expect(notifyMock).toHaveBeenCalledWith(
        "success",
        "Repair completion photo(s) uploaded successfully."
      );
    });
  });

  it("clicking an image opens the full-size modal", async () => {
    api.getComplaint.mockResolvedValue(mockComplaintWithImages);

    render(
      <ComplaintDetailsPage
        complaintId={55}
        token="test-token"
        session={makeSession("admin", 99)}
        staffMap={{ 2: "Tech Alice" }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        notify={vi.fn()}
        handleError={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("rattling_unit.png")).toBeTruthy();
    });

    // Click on the issue image card
    fireEvent.click(screen.getByText("rattling_unit.png"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByTitle("Open full resolution in new tab")).toBeTruthy();
    });

    // Close modal
    fireEvent.click(screen.getByTitle("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uploader sees delete button in modal while non-uploader cannot delete", async () => {
    window.confirm = vi.fn(() => true);
    api.getComplaint.mockResolvedValue(mockComplaintWithImages);
    api.deleteComplaintImage.mockResolvedValue({ message: "Image deleted successfully" });

    // Resident (userId: 1) views complaint
    const { unmount } = render(
      <ComplaintDetailsPage
        complaintId={55}
        token="test-token"
        session={makeSession("user", 1)}
        staffMap={{ 2: "Tech Alice" }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        notify={vi.fn()}
        handleError={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("rattling_unit.png")).toBeTruthy();
    });

    // Case 1: Resident clicks their OWN photo (user_id: 1) -> delete button exists
    fireEvent.click(screen.getByText("rattling_unit.png"));
    await waitFor(() => {
      expect(screen.getByTitle("Delete image")).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle("Delete image"));
    expect(api.deleteComplaintImage).toHaveBeenCalledWith("test-token", 55, 11);

    unmount();

    // Case 2: Non-uploader Staff (userId: 3) opens Staff's repair photo (user_id: 2) -> delete button NOT visible
    render(
      <ComplaintDetailsPage
        complaintId={55}
        token="test-token"
        session={makeSession("staff", 3)}
        staffMap={{ 2: "Tech Alice", 3: "Tech Bob" }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        notify={vi.fn()}
        handleError={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("motor_replaced.png")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("motor_replaced.png"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.queryByTitle("Delete image")).toBeNull();
    });
  });
});
