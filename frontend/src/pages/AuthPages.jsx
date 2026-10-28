import { useState } from "react";
import * as api from "../api.js";
import { Banner } from "../components/ui.jsx";

export default function AuthPages({ onAuthenticated, notice }) {
  const [mode, setMode] = useState("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

      if (data.reset_token) {
        setResetToken(data.reset_token);
        setMode("reset");
        setSuccess(
          "Reset token generated. No email service is configured on this server, so copy the token below and use it in the next step."
        );
      } else {
        setSuccess(data.message || "If an account matches those details, a reset token has been generated.");
      }
    } catch (err) {
      setError(err.message || "Unable to request a reset token.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(resetToken.trim(), newPassword);
      setSuccess("Password reset successfully. Please sign in with your new password.");
      setMode("login");
      setPassword("");
      setNewPassword("");
      setResetToken("");
    } catch (err) {
      setError(err.message || "Password reset failed.");
    } finally {
      setLoading(false);
    }
  }

  const headings = {
    login: ["Welcome Back!", "Sign in to manage your complaints."],
    register: ["Create Account", "Register to start managing your complaints."],
    forgot: ["Forgot Password", "Request a reset token for your account."],
    reset: ["Reset Password", "Set a new password using your reset token."],
  };

  const [heading, subheading] = headings[mode];

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

        {mode === "forgot" && (
          <p className="auth-note">
            The server issues a reset token directly. Because no email delivery
            is configured, the token is shown to you in the next step.
          </p>
        )}

        {mode === "reset" && (
          <>
            <label htmlFor="reset-token">Reset token</label>
            <textarea
              id="reset-token"
              rows="3"
              className="token-input"
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              placeholder="Paste the token issued by the server"
              required
            />

            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
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
                  ? "Request Reset Token"
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

          {(mode === "forgot" || mode === "reset") && (
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
        </p>
      </form>
    </main>
  );
}
