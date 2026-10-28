import { useEffect, useState } from "react";
import * as api from "../api.js";
import { Spinner, EmptyState, Banner, Modal } from "../components/ui.jsx";
import { RoleBadge } from "../components/badges.jsx";
import { ROLES } from "../constants.js";
import { formatDay } from "../utils.js";

export default function UsersPage({
  token,
  session,
  notify,
  handleError,
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState("");

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.adminListUsers(token, { search, role }).then(
      (data) => {
        if (cancelled) return;
        setUsers(data);
        setLoadError("");
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setLoading(false);
        if (err.status === 401 || err.status === 403) {
          handleError(err);
          return;
        }
        setLoadError(err.message || "Unable to load users.");
      }
    );

    return () => {
      cancelled = true;
    };
  }, [token, search, role, handleError]);

  function applySearch(event) {
    event.preventDefault();
    setLoadError("");
    setLoading(true);
    setSearch(searchInput.trim());
  }

  async function handleRoleChange(user, nextRole) {
    if (nextRole === user.role) return;

    if (user.id === session.userId) {
      setRowError("You cannot change your own role.");
      return;
    }

    setBusyId(user.id);
    setRowError("");
    try {
      const updated = await api.adminUpdateRole(token, user.id, nextRole);
      setUsers((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      notify("success", `${updated.username} is now ${updated.role}.`);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setRowError(err.message || "Unable to update role.");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(user) {
    setEditing(user);
    setEditName(user.full_name || "");
    setEditEmail(user.email || "");
    setEditError("");
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditSaving(true);
    setEditError("");

    try {
      const updated = await api.adminUpdateUser(token, editing.id, {
        full_name: editName.trim() || null,
        email: editEmail.trim() || null,
      });
      setUsers((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      notify("success", `${updated.username} updated.`);
      setEditing(null);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setEditError(err.message || "Unable to update user.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `Delete ${user.username}? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(user.id);
    setRowError("");
    try {
      await api.adminDeleteUser(token, user.id);
      setUsers((previous) => previous.filter((item) => item.id !== user.id));
      notify("success", `${user.username} deleted.`);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setRowError(err.message || "Unable to delete user.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="complaints-panel">
      <div className="panel-heading">
        <div>
          <h2>Users</h2>
          <p>{users.length} account{users.length === 1 ? "" : "s"} found</p>
        </div>
      </div>

      <div className="filters">
        <form className="inline-search" onSubmit={applySearch}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search username, name, or email..."
            aria-label="Search users"
          />
          <button className="secondary-button" type="submit">
            Search
          </button>
        </form>

        <select
          value={role}
          onChange={(event) => {
            setLoadError("");
            setLoading(true);
            setRole(event.target.value);
          }}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {rowError && (
        <Banner type="error" message={rowError} onClose={() => setRowError("")} />
      )}
      {loadError && (
        <Banner
          type="error"
          message={loadError}
          onClose={() => setLoadError("")}
        />
      )}

      {loading ? (
        <Spinner label="Loading users..." />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users match your search."
          hint="Try a different keyword or role filter."
        />
      ) : (
        <div className="table-wrapper">
          <table className="complaint-table users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>#{user.id}</td>
                  <td className="table-title-cell">
                    <span className="table-title">{user.username}</span>
                    <span className="table-description">
                      {user.full_name || "No name provided"}
                    </span>
                  </td>
                  <td className="table-secondary">{user.email || "\u2014"}</td>
                  <td>
                    <div className="role-control">
                      <RoleBadge role={user.role} />
                      <select
                        value={user.role}
                        disabled={busyId === user.id || user.id === session.userId}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                        aria-label={`Change role for ${user.username}`}
                      >
                        {ROLES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="table-secondary">{formatDay(user.created_at)}</td>
                  <td className="action-buttons">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => openEdit(user)}
                      disabled={busyId === user.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleDelete(user)}
                      disabled={busyId === user.id || user.id === session.userId}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`Edit ${editing.username}`} onClose={() => setEditing(null)}>
          <form className="modal-form" onSubmit={saveEdit}>
            <label htmlFor="edit-name">Full name</label>
            <input
              id="edit-name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />

            <label htmlFor="edit-email">Email</label>
            <input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(event) => setEditEmail(event.target.value)}
            />

            <Banner
              type="error"
              message={editError}
              onClose={() => setEditError("")}
            />

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditing(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
