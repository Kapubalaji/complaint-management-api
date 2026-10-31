import { useState } from "react";
import * as api from "../api.js";
import { Banner } from "../components/ui.jsx";

export default function AuthPages({
  onAuthenticated,
  notice = "",
  initialMode = "login",
  initialResetToken = null,
  onClearResetToken,
}) {
  const [mode, setMode] = useState(() => (initialResetToken ? "reset" : initialMode));
  const [resetToken, setResetToken] = useState(() => initialResetToken);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setNewPassword("");
  }

  function cancelReset() {
    setResetToken(null);
    if (onClearResetToken) onClearResetToken();
    switchMode("login");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await api.loginUser(username.trim(), password);
      onAuthenticated(data);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      await api.registerUser(username.trim(), password, {
        full_name: fullName.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSuccess("Account created successfully! Please sign in.");
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await api.forgotPassword(
        username.trim(),
        email.trim() || undefined
      );
      setSuccess(
        data.message ||
          "If an account matches those details, password reset instructions have been prepared."
      );
    } catch (err) {
      setError(err.message || "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!resetToken) {
      setError("No reset token available. Please request a new reset link.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.resetPassword(resetToken, newPassword);
      setSuccess(
        data.message ||
          "Password has been successfully reset. You may now sign in."
      );
      setResetToken(null);
      if (onClearResetToken) onClearResetToken();
      setPassword("");
      setConfirmPassword("");
      setNewPassword("");
      setMode("login");
    } catch (err) {
      setError(
        err.message ||
          "Password reset failed. The token may be expired or already used."
      );
    } finally {
      setLoading(false);
    }
  }

  const headings = {
    login: ["Welcome Back!", "Sign in to manage your complaints."],
    register: ["Create Account", "Register to start managing your complaints."],
    forgot: [
      "Forgot Password",
      "Request password reset instructions for your account.",
    ],
    reset: [
      "Reset Password",
      "Enter your new password below.",
    ],
  };

  const [heading, subheading] = headings[mode] || headings.login;

  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={
          mode === "login"
            ? handleLogin
            : mode === "register"
              ? handleRegister
              : mode === "forgot"
                ? handleForgot
                : handleReset
        }
      >
        <h1>ResolveIT</h1>
        <h2>{heading}</h2>
        <p>{subheading}</p>

        <Banner type="error" message={error} onClose={() => setError("")} />
        <Banner type="success" message={success} onClose={() => setSuccess("")} />
        <Banner type="error" message={notice} />

        {(mode === "login" || mode === "register" || mode === "forgot") && (
          <>
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </>
        )}

        {mode === "register" && (
          <>
            <label htmlFor="auth-full-name">Full name <span className="optional">(optional)</span></label>
            <input
              id="auth-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
            />

            <label htmlFor="auth-email">Email <span className="optional">(optional)</span></label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </>
        )}

        {mode === "forgot" && (
          <>
            <label htmlFor="auth-email">Email <span className="optional">(optional)</span></label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </>
        )}

        {(mode === "login" || mode === "register") && (
          <>
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
            />
          </>
        )}

        {mode === "register" && (
          <>
            <label htmlFor="auth-confirm">Confirm password</label>
            <input
              id="auth-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </>
        )}

        {mode === "reset" && (
          <>
            <label htmlFor="auth-new-password">New password</label>
            <input
              id="auth-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />

            <label htmlFor="auth-confirm-password">Confirm new password</label>
            <input
              id="auth-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </>
        )}

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : mode === "login"
              ? "Sign In"
              : mode === "register"
                ? "Create Account"
                : mode === "forgot"
                  ? "Request Password Reset"
                  : "Reset Password"}
        </button>

        <p className="auth-switch">
          {mode === "login" && (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("register")}
              >
                Register
              </button>
              <br />
              <button
                type="button"
                className="text-button subtle"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            </>
          )}

          {mode === "register" && (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("login")}
              >
                Sign In
              </button>
            </>
          )}

          {mode === "forgot" && (
            <>
              Remembered your password?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("login")}
              >
                Sign In
              </button>
            </>
          )}

          {mode === "reset" && (
            <>
              Remembered your password?{" "}
              <button
                type="button"
                className="text-button"
                onClick={cancelReset}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
