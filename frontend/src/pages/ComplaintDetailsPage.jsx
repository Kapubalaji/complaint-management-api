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
  resolveUserLabel,
  canEditComplaint,
  canDeleteComplaint,
  canManageWorkflow,
  statusLabel,
} from "../utils.js";

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

  return (
    <>
      <section className="complaints-panel detail-panel">
        <div className="detail-topbar">
          <button className="secondary-button" type="button" onClick={onBack}>
            &larr; Back
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

        <div className="detail-title">
          <span className="detail-id">#{complaint.id}</span>
          <h2>{complaint.title}</h2>
        </div>

        <div className="detail-badges">
          <StatusBadge status={complaint.status} />
          <PriorityBadge priority={complaint.priority} />
          <CategoryBadge category={complaint.category} />
          <SentimentBadge sentiment={complaint.sentiment} />
        </div>

        <div className="detail-layout">
          <div className="detail-main">
            <article className="detail-card">
              <h3>Description</h3>
              <p className="detail-description">{complaint.description}</p>
            </article>

            <AiInsights
              analysis={complaint}
              staffMap={staffMap}
              session={session}
              onReanalyze={handleReanalyze}
              reanalyzing={reanalyzing}
              note="Analysis stored on this complaint. Re-run to refresh category, priority, sentiment, summary, and staff suggestion."
            />

            <CommentThread
              token={token}
              complaintId={complaint.id}
              session={session}
              staffMap={staffMap}
            />
          </div>

          <aside className="detail-side">
            <section className="detail-card">
              <h3>Details</h3>
              <dl className="meta-list">
                <dt>Reporter</dt>
                <dd>
                  {complaint.user_id === session.userId
                    ? "You"
                    : `User #${complaint.user_id}`}
                </dd>

                <dt>Assigned to</dt>
                <dd>
                  {resolveUserLabel(
                    complaint.assigned_staff_id,
                    session,
                    staffMap
                  )}
                </dd>

                <dt>Suggested staff</dt>
                <dd>
                  {complaint.suggested_staff_id
                    ? resolveUserLabel(
                        complaint.suggested_staff_id,
                        session,
                        staffMap
                      )
                    : "None"}
                </dd>

                <dt>Created</dt>
                <dd>{formatDate(complaint.created_at)}</dd>

                <dt>Updated</dt>
                <dd>{formatDate(complaint.updated_at)}</dd>

                <dt>Resolved</dt>
                <dd>{formatDate(complaint.resolved_at)}</dd>
              </dl>
            </section>

            {staff && (
              <>
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

                <section className="detail-card">
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
              </>
            )}

            {!staff && (
              <section className="detail-card info-card">
                <h3>Need a status change?</h3>
                <p>
                  Support staff review and update complaints. You&apos;ll see
                  status changes and replies in the comments below.
                </p>
              </section>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
