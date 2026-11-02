import { useEffect, useState } from "react";
import * as api from "../api.js";
import AiInsights from "../components/AiInsights.jsx";
import CommentThread from "../components/CommentThread.jsx";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  SentimentBadge,
} from "../components/badges.jsx";
import { Spinner, Banner } from "../components/ui.jsx";
import { STATUSES } from "../constants.js";
import {
  formatDate,
  formatDay,
  resolveUserLabel,
  canEditComplaint,
  canDeleteComplaint,
  canManageWorkflow,
  canAssignComplaints,
  statusLabel,
} from "../utils.js";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconTag,
  IconUser,
} from "../components/Icons.jsx";

export default function ComplaintDetailsPage({
  complaintId,
  token,
  session,
  staffMap = {},
  onBack,
  onEdit,
  onDelete,
  notify,
  handleError,
  onChanged,
}) {
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [statusValue, setStatusValue] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [assignee, setAssignee] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState("");

  const [reanalyzing, setReanalyzing] = useState(false);

  const staff = canManageWorkflow(session);
  const canAssign = canAssignComplaints(session);

  useEffect(() => {
    let cancelled = false;

    api.getComplaint(token, complaintId).then(
      (data) => {
        if (cancelled) return;
        setComplaint(data);
        setStatusValue(data.status || "open");
        setAssignee(
          data.assigned_staff_id ? String(data.assigned_staff_id) : ""
        );
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
        setLoadError(err.message || "Unable to load this complaint.");
      }
    );

    return () => {
      cancelled = true;
    };
  }, [token, complaintId, handleError]);

  async function handleStatusUpdate(event) {
    event.preventDefault();
    setStatusError("");

    if (!statusValue) {
      setStatusError("Choose a status.");
      return;
    }

    setStatusBusy(true);
    try {
      const updated = await api.updateComplaintStatus(token, complaintId, {
        status: statusValue,
        resolution_note: resolutionNote.trim() || undefined,
      });
      setComplaint(updated);
      setResolutionNote("");
      notify(
        "success",
        `Status updated to ${statusLabel(updated.status)}.`
      );
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setStatusError(err.message || "Unable to update status.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleAssign(event) {
    event.preventDefault();
    setAssignError("");

    if (!assignee) {
      setAssignError("Choose a staff member.");
      return;
    }

    setAssignBusy(true);
    try {
      const updated = await api.assignComplaint(
        token,
        complaintId,
        Number(assignee)
      );
      setComplaint(updated);
      notify(
        "success",
        `Complaint assigned to ${resolveUserLabel(updated.assigned_staff_id, session, staffMap)}.`
      );
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setAssignError(err.message || "Unable to assign complaint.");
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const updated = await api.reanalyzeComplaint(token, complaintId);
      setComplaint(updated);
      notify("success", "AI analysis refreshed.");
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      notify("error", err.message || "Unable to re-run AI analysis.");
    } finally {
      setReanalyzing(false);
    }
  }

  if (loading) {
    return (
      <section className="complaints-panel">
        <Spinner label="Loading complaint..." />
      </section>
    );
  }

  if (loadError || !complaint) {
    return (
      <section className="complaints-panel">
        <Banner
          type="error"
          message={loadError || "Complaint not found."}
          onClose={onBack}
        />
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            Back to complaints
          </button>
        </div>
      </section>
    );
  }

  const editable = canEditComplaint(complaint, session);
  const deletable = canDeleteComplaint(complaint, session);

  const staffOptions = Object.entries(staffMap).map(([id, label]) => ({
    id,
    label,
  }));

  const assignedStaffName = complaint.assigned_staff_id
    ? resolveUserLabel(complaint.assigned_staff_id, session, staffMap)
    : null;

  return (
    <>
      <section className="complaints-panel detail-panel">
        {/* Back Link (Screen 06: < Back to list) */}
        <div className="detail-topbar">
          <button
            className="back-to-list-btn"
            type="button"
            onClick={onBack}
            aria-label="Back to complaints"
          >
            <IconArrowLeft size={16} />
            <span>Back to list</span>
          </button>

          <div className="detail-actions">
            {editable && (
              <button
                className="edit-button"
                type="button"
                onClick={() => onEdit(complaint)}
              >
                Edit
              </button>
            )}
            {deletable && (
              <button
                className="delete-button"
                type="button"
                onClick={() => onDelete(complaint)}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Title & Badges Banner (Screen 06) */}
        <div className="detail-header-card">
          <div className="detail-title-row">
            <h2>
              <span className="detail-id-hash">#{complaint.id}</span> — {complaint.title}
            </h2>
            <div className="detail-pill-badges">
              <StatusBadge status={complaint.status} />
              <PriorityBadge priority={complaint.priority} />
            </div>
          </div>

          <div className="detail-meta-icons-row">
            <span className="meta-icon-item">
              <IconTag size={15} />
              <span>{complaint.category || "General"}</span>
            </span>
            <span className="meta-icon-item">
              <IconCalendar size={15} />
              <span>{formatDay(complaint.created_at)}</span>
            </span>
            <span className="meta-icon-item">
              <IconClock size={15} />
              <span>{formatDate(complaint.created_at)}</span>
            </span>
            {complaint.sentiment && (
              <SentimentBadge sentiment={complaint.sentiment} />
            )}
          </div>
        </div>

        <div className="detail-layout">
          <div className="detail-main">
            {/* Description Card */}
            <article className="detail-card">
              <h3>Description</h3>
              <p className="detail-description">{complaint.description}</p>
            </article>

            {/* Attached Image Preview Card (Screen 06) */}
            <article className="detail-card">
              <h3>Image</h3>
              <div className="image-preview-box">
                <div className="image-preview-placeholder">
                  <span className="preview-tag">Attached Photo Preview</span>
                  <p className="preview-sub">#{complaint.id} &bull; {complaint.category || "Issue"}</p>
                </div>
              </div>
            </article>

            {/* Assigned To Section (Screen 06) */}
            <article className="detail-card assigned-technician-card">
              <h3>Assigned To</h3>
              {assignedStaffName ? (
                <div className="technician-profile-row">
                  <div className="technician-avatar">
                    {assignedStaffName.charAt(0).toUpperCase()}
                  </div>
                  <div className="technician-info">
                    <strong>{assignedStaffName}</strong>
                    <small>Technician / Support Staff</small>
                  </div>
                  <span className="assigned-date">
                    {formatDate(complaint.updated_at || complaint.created_at)}
                  </span>
                </div>
              ) : (
                <p className="unassigned-notice">
                  No technician assigned yet. Support administration assigns incoming requests.
                </p>
              )}
            </article>

            {/* Comments Thread (Screen 06) */}
            <CommentThread
              token={token}
              complaintId={complaint.id}
              session={session}
              staffMap={staffMap}
            />
          </div>

          <aside className="detail-side">
            {/* AI Insights Panel */}
            <AiInsights
              analysis={complaint}
              staffMap={staffMap}
              session={session}
              onReanalyze={handleReanalyze}
              reanalyzing={reanalyzing}
              note="AI triage results stored on this complaint. Re-run to refresh category, priority, sentiment, and staff recommendation."
            />

            {/* Status Update Form (Staff / Admin) */}
            {staff && (
              <section className="detail-card">
                <h3>Update Status</h3>
                <form className="stacked-form" onSubmit={handleStatusUpdate}>
                  <label htmlFor="detail-status">Status</label>
                  <select
                    id="detail-status"
                    value={statusValue}
                    onChange={(event) => setStatusValue(event.target.value)}
                  >
                    {STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {statusLabel(option)}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="resolution-note">
                    Resolution note <span className="optional">(optional)</span>
                  </label>
                  <textarea
                    id="resolution-note"
                    rows="3"
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    placeholder="What was done to resolve this?"
                  />

                  <Banner
                    type="error"
                    message={statusError}
                    onClose={() => setStatusError("")}
                  />

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={statusBusy}
                  >
                    {statusBusy ? "Updating..." : "Update Status"}
                  </button>
                </form>
              </section>
            )}

            {/* Assignment Panel (Admin Only - Screen 09) */}
            {canAssign && (
              <section className="detail-card" data-testid="assignment-panel">
                <h3>Assignment</h3>
                <form className="stacked-form" onSubmit={handleAssign}>
                  <label htmlFor="assign-select">Assign to</label>
                  <select
                    id="assign-select"
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <Banner
                    type="error"
                    message={assignError}
                    onClose={() => setAssignError("")}
                  />

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={assignBusy || !assignee}
                  >
                    {assignBusy ? "Assigning..." : "Save Assignment"}
                  </button>
                </form>
              </section>
            )}

            {!staff && !canAssign && (
              <section className="detail-card info-card">
                <h3>Need a status change?</h3>
                <p>
                  Support staff review and update complaints. You&apos;ll see
                  status updates and replies in the comments.
                </p>
              </section>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
