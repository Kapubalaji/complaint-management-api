
import { useState, useEffect } from "react";
import { loginUser, registerUser, getComplaints } from "./api.js";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("access_token") || ""
  );

  const [username, setUsername] = useState(
    () => sessionStorage.getItem("username") || ""
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authPage, setAuthPage] = useState("login");
  const [activePage, setActivePage] = useState("Dashboard");

  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const menuItems = ["Dashboard", "My Complaints", "New Complaint"];

  // Load complaints automatically when a saved token exists.
  useEffect(() => {
    if (!token) {
      setComplaints([]);
      setHasLoaded(false);
      return;
    }

    let cancelled = false;

    async function loadSavedComplaints() {
      setLoading(true);
      setError("");

      try {
        const data = await getComplaints(token);

        if (!cancelled) {
          setComplaints(data);
          setHasLoaded(true);
        }

     } catch (err) {
          if (!cancelled) {
            if (err.status === 401 || err.status === 403) {
               handleLogout();
               setError("Your session has expired. Please sign in again.");
               return;
          }

            setError(err.message || "Unable to load complaints.");
            setHasLoaded(false);
          }
        }
       finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSavedComplaints();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await loginUser(username.trim(), password);

      sessionStorage.setItem("access_token", data.access_token);
      sessionStorage.setItem("username", username.trim());

      setToken(data.access_token);
      setUsername(username.trim());
      setPassword("");
      setConfirmPassword("");
      setActivePage("Dashboard");
      setSuccess("Login successful!");
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
      await registerUser(username.trim(), password);

      setSuccess("Account created successfully! Please sign in.");
      setAuthPage("login");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("username");

    setToken("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setComplaints([]);
    setHasLoaded(false);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setActivePage("Dashboard");
    setAuthPage("login");
    setError("");
    setSuccess("");
  }

  function startEditing(complaint) {
    setEditingId(complaint.id);
    setTitle(complaint.title);
    setDescription(complaint.description);
    setActivePage("New Complaint");
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setError("");
    setSuccess("");
  }

  async function handleComplaintSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !description.trim()) {
      setError("Please enter both a title and description.");
      return;
    }

    setLoading(true);

    try {
      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API_URL}/complaints/${editingId}`
        : `${API_URL}/complaints`;

      const existingComplaint = complaints.find(
        (item) => item.id === editingId
      );

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          status: isEditing
            ? existingComplaint?.status || "Open"
            : "Open",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Request failed: ${response.status}`
        );
      }

      if (isEditing) {
        setComplaints((previous) =>
          previous.map((item) => item.id === editingId ? data : item)
        );
        setSuccess("Complaint updated successfully!");
      } else {
        setComplaints((previous) => [data, ...previous]);
        setSuccess("Complaint submitted successfully!");
      }

      setHasLoaded(true);
      setEditingId(null);
      setTitle("");
      setDescription("");
      setActivePage("My Complaints");
    } catch (err) {
        if (
          err.message.includes("401") ||
          err.message.includes("403")
        ) {
          handleLogout();
          setError("Your session has expired. Please sign in again.");
          return;
        }

        setError(err.message || "Unable to save complaint.");

    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteComplaint(complaintId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this complaint?"
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/complaints/${complaintId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Delete failed: ${response.status}`
        );
      }

      setComplaints((previous) =>
        previous.filter((item) => item.id !== complaintId)
      );

      setSuccess("Complaint deleted successfully!");
    } catch (err) {
      setError(err.message || "Unable to delete complaint.");
    } finally {
      setLoading(false);
    }
  }

  const total = complaints.length;

  const open = complaints.filter(
    (item) => item.status?.toLowerCase() === "open"
  ).length;

  const inProgress = complaints.filter(
    (item) => item.status?.toLowerCase() === "in progress"
  ).length;

  const resolved = complaints.filter(
    (item) => item.status?.toLowerCase() === "resolved"
  ).length;

  const filteredComplaints = complaints.filter((item) => {
    const query = search.toLowerCase();

    const matchesSearch =
      String(item.id ?? "").includes(query) ||
      item.title?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "All" ||
      item.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  function renderComplaintTable(items) {
    if (loading && !hasLoaded) {
      return <p className="empty-state">Loading complaints...</p>;
    }

    if (!hasLoaded) {
      return <p className="empty-state">Your complaints will appear here.</p>;
    }

    if (items.length === 0) {
      return (
        <p className="empty-state">
          {complaints.length === 0
            ? "You haven't submitted any complaints yet."
            : "No complaints match your search."}
        </p>
      );
    }

    return (
      <div className="table-wrapper">
        <table className="complaint-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Complaint</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>#{item.id}</td>
                <td className="table-title">{item.title}</td>
                <td className="table-description">{item.description}</td>

                <td>
                  <span
                    className={`status-badge ${item.status
                      ?.toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {item.status}
                  </span>
                </td>

                <td className="action-buttons">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => startEditing(item)}
                    disabled={loading}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDeleteComplaint(item.id)}
                    disabled={loading}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Show login or registration when the user is logged out.
  if (!token) {
    const isRegistering = authPage === "register";

    return (
      <main className="login-page">
        <form
          className="login-card"
          onSubmit={isRegistering ? handleRegister : handleLogin}
        >
          <h1>ResolveIT</h1>

          <h2>{isRegistering ? "Create Account" : "Welcome Back!"}</h2>

          <p>
            {isRegistering
              ? "Register to start managing your complaints."
              : "Sign in to manage your complaints."}
          </p>

          {error && (
            <p className="error-message" role="alert">{error}</p>
          )}

          {success && (
            <p className="success-message" role="status">{success}</p>
          )}

          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
            required
          />

          {isRegistering && (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
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
              : isRegistering
                ? "Create Account"
                : "Sign In"}
          </button>

          <p className="auth-switch">
            {isRegistering
              ? "Already have an account?"
              : "Don't have an account?"}

            {" "}

            <button
              type="button"
              className="text-button"
              onClick={() => {
                setAuthPage(isRegistering ? "login" : "register");
                setError("");
                setSuccess("");
                setPassword("");
                setConfirmPassword("");
              }}
            >
              {isRegistering ? "Sign In" : "Register"}
            </button>
          </p>
        </form>
      </main>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">ResolveIT</h2>
        <p className="menu-label">WORKSPACE</p>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item}
              className={activePage === item ? "menu-item active" : "menu-item"}
              onClick={() => {
                if (editingId !== null && item !== "New Complaint") {
                  cancelEditing();
                }

                setActivePage(item);
                setError("");
                setSuccess("");
              }}
            >
              {item === "New Complaint" && editingId !== null
                ? "Edit Complaint"
                : item}
            </button>
          ))}
        </nav>

        <button className="menu-item logout-button" onClick={handleLogout}>
          Log out
        </button>

        <div className="sidebar-footer">Complaint Management</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              {activePage === "New Complaint" && editingId !== null
                ? "Edit Complaint"
                : activePage}
            </h1>
            <p>Manage and track your service requests.</p>
          </div>

          <div className="user-profile">
            <span className="avatar">
              {(username || "U").charAt(0).toUpperCase()}
            </span>
            <span>{username || "User"}</span>
          </div>
        </header>

        {error && (
          <p className="error-message" role="alert">{error}</p>
        )}

        {success && (
          <p className="success-message" role="status">{success}</p>
        )}

        {activePage === "Dashboard" && (
          <>
            <section className="welcome">
              <h2>Welcome back, {username}!</h2>
              <p>Here's an overview of your service requests.</p>
            </section>

            <section className="stats">
              <article className="stat-card">
                <p>Total Complaints</p>
                <h2>{total}</h2>
              </article>
              <article className="stat-card">
                <p>Open</p>
                <h2>{open}</h2>
              </article>
              <article className="stat-card">
                <p>In Progress</p>
                <h2>{inProgress}</h2>
              </article>
              <article className="stat-card">
                <p>Resolved</p>
                <h2>{resolved}</h2>
              </article>
            </section>

            <section className="complaints-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent Complaints</h2>
                  <p>Your latest service requests</p>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => setActivePage("My Complaints")}
                >
                  View all
                </button>
              </div>

              {renderComplaintTable(complaints.slice(0, 5))}
            </section>
          </>
        )}

        {activePage === "My Complaints" && (
          <section className="complaints-panel">
            <div className="panel-heading">
              <div>
                <h2>All Complaints</h2>
                <p>{total} complaint(s) in your account</p>
              </div>

              <button
                className="primary-button"
                onClick={() => {
                  cancelEditing();
                  setActivePage("New Complaint");
                }}
              >
                + New Complaint
              </button>
            </div>

            <div className="filters">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search complaints..."
                aria-label="Search complaints"
              />

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter by status"
              >
                <option>All</option>
                <option>Open</option>
                <option>In Progress</option>
                <option>Resolved</option>
              </select>
            </div>

            {renderComplaintTable(filteredComplaints)}
          </section>
        )}

        {activePage === "New Complaint" && (
          <section className="complaints-panel form-panel">
            <h2>{editingId !== null ? "Edit Complaint" : "Submit a Complaint"}</h2>

            <p>
              {editingId !== null
                ? "Update the details of your complaint."
                : "Tell us about the issue you need resolved."}
            </p>

            <form className="complaint-form" onSubmit={handleComplaintSubmit}>
              <label htmlFor="complaint-title">Complaint title</label>
              <input
                id="complaint-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Internet not working"
                required
              />

              <label htmlFor="complaint-description">Description</label>
              <textarea
                id="complaint-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the issue in detail..."
                rows="5"
                required
              />

              <button className="primary-button" type="submit" disabled={loading}>
                {loading
                  ? "Saving..."
                  : editingId !== null
                    ? "Save Changes"
                    : "Submit Complaint"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    cancelEditing();
                    setActivePage("My Complaints");
                  }}
                >
                  Cancel Editing
                </button>
              )}
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
