import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuthPages from "../pages/AuthPages.jsx";
import App from "../App.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  getComplaints: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]),
  getAnalytics: vi.fn().mockResolvedValue({}),
}));

describe("Password Reset Workflows & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("renders forgot password form and submits request with generic confirmation", async () => {
    api.forgotPassword.mockResolvedValue({
      message: "If an account matches those details, password reset instructions have been prepared.",
    });

    render(<AuthPages onAuthenticated={vi.fn()} />);

    // Switch to forgot password mode
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Forgot Password" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Request Password Reset" }));

    await waitFor(() =>
      expect(api.forgotPassword).toHaveBeenCalledWith("alice", "alice@example.com")
    );
    expect(
      screen.getByText("If an account matches those details, password reset instructions have been prepared.")
    ).toBeTruthy();
  });

  it("extracts URL fragment token, removes it from browser history, and renders reset screen", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    window.location.hash = "#reset_token=sample-test-token-777";

    render(<App />);

    expect(replaceStateSpy).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Reset Password" })).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeTruthy();
  });

  it("validates password length and matching confirmation before submitting", async () => {
    render(<AuthPages onAuthenticated={vi.fn()} initialResetToken="sample-token" />);

    // Mismatched passwords
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(screen.getByText("Passwords do not match.")).toBeTruthy();
    expect(api.resetPassword).not.toHaveBeenCalled();

    // Short password (< 8 chars)
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "short" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(screen.getByText("Password must contain at least 8 characters.")).toBeTruthy();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("submits reset password, clears token from memory, and transitions to login", async () => {
    api.resetPassword.mockResolvedValue({
      message: "Password has been successfully reset. You may now sign in.",
    });

    const onClearResetToken = vi.fn();
    render(
      <AuthPages
        onAuthenticated={vi.fn()}
        initialResetToken="valid-token-xyz"
        onClearResetToken={onClearResetToken}
      />
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "ValidNewPass123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "ValidNewPass123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() =>
      expect(api.resetPassword).toHaveBeenCalledWith("valid-token-xyz", "ValidNewPass123!")
    );
    expect(onClearResetToken).toHaveBeenCalled();
    expect(
      screen.getByText("Password has been successfully reset. You may now sign in.")
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome Back!" })).toBeTruthy();
  });

  it("clears reset token and returns to login when cancel is clicked", () => {
    const onClearResetToken = vi.fn();
    render(
      <AuthPages
        onAuthenticated={vi.fn()}
        initialResetToken="valid-token-xyz"
        onClearResetToken={onClearResetToken}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(onClearResetToken).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Welcome Back!" })).toBeTruthy();
  });
});
