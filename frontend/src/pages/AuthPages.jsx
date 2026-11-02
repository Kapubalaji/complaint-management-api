import { useState } from "react";
import * as api from "../api.js";
import { Banner } from "../components/ui.jsx";
import { ShieldLogo, IconEye, IconEyeOff, IconCheckCircle } from "../components/Icons.jsx";

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

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    login: ["Welcome Back!", "Login to continue"],
    register: ["Create Account", "Register to get started"],
    forgot: [
      "Forgot Password",
      "Enter your email to reset password",
    ],
    reset: [
      "Reset Password",
      "Enter your new password below.",
    ],
  };

  const [heading, subheading] = headings[mode] || headings.login;

  return (
    <main className="login-page">
      <div className="auth-wrapper">
        {/* Left Side Hero Banner (Desktop) */}
        <aside className="auth-hero" aria-hidden="true">
          <div className="auth-hero-badge">
            <ShieldLogo size={28} />
            <span>ResolveIT CMS</span>
          </div>
          <h2>Complaint Management System</h2>
          <p className="auth-hero-desc">
            A complete solution to raise, track, and resolve complaints efficiently.
          </p>

          <ul className="auth-features">
            <li>
              <IconCheckCircle className="check-icon" size={20} />
              <span>Easy Complaint Submission</span>
            </li>
            <li>
              <IconCheckCircle className="check-icon" size={20} />
              <span>Real-time Tracking</span>
            </li>
            <li>
              <IconCheckCircle className="check-icon" size={20} />
              <span>Smart Assignment</span>
            </li>
            <li>
              <IconCheckCircle className="check-icon" size={20} />
              <span>Reports & Analytics</span>
            </li>
            <li>
              <IconCheckCircle className="check-icon" size={20} />
              <span>Role-based Access</span>
            </li>
          </ul>
        </aside>

        {/* Right Side Form Card */}
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
          <div className="auth-card-header">
            <div className="auth-shield-wrap">
              <ShieldLogo size={48} />
            </div>
            <h1>ResolveIT CMS</h1>
            <h2>{heading}</h2>
            <p>{subheading}</p>
          </div>

          <Banner type="error" message={error} onClose={() => setError("")} />
          <Banner type="success" message={success} onClose={() => setSuccess("")} />
          <Banner type="error" message={notice} />

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <div className="form-group">
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                value={username}
                placeholder={mode === "login" ? "Enter your username" : "Choose a username"}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
          )}

          {mode === "register" && (
            <>
              <div className="form-group">
                <label htmlFor="auth-full-name">
                  Full name <span className="optional">(optional)</span>
                </label>
                <input
                  id="auth-full-name"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="auth-email">
                  Email <span className="optional">(optional)</span>
                </label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            </>
          )}

          {mode === "forgot" && (
            <div className="form-group">
              <label htmlFor="auth-email">
                Email <span className="optional">(optional)</span>
              </label>
              <input
                id="auth-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="form-group">
              <label htmlFor="auth-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "login" ? "Enter password" : "Create password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>
          )}

          {mode === "login" && (
            <div className="auth-options-row">
              <button
                type="button"
                className="text-button subtle"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "register" && (
            <div className="form-group">
              <label htmlFor="auth-confirm">Confirm password</label>
              <div className="password-input-wrap">
                <input
                  id="auth-confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>
          )}

          {mode === "reset" && (
            <>
              <div className="form-group">
                <label htmlFor="auth-new-password">New password</label>
                <div className="password-input-wrap">
                  <input
                    id="auth-new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="auth-confirm-password">Confirm new password</label>
                <div className="password-input-wrap">
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : mode === "register"
                  ? "Register"
                  : mode === "forgot"
                    ? "Request Password Reset"
                    : "Reset Password"}
          </button>

          <div className="auth-switch">
            {mode === "login" && (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchMode("register")}
                >
                  Register
                </button>
              </p>
            )}

            {mode === "register" && (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchMode("login")}
                >
                  Sign In
                </button>
              </p>
            )}

            {mode === "forgot" && (
              <p>
                Remembered your password?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchMode("login")}
                >
                  Back to Login
                </button>
              </p>
            )}

            {mode === "reset" && (
              <p>
                Remembered your password?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={cancelReset}
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
