import { useEffect, useState, useRef } from "react";
import * as api from "../api.js";
import AiInsights from "../components/AiInsights.jsx";
import CommentThread from "../components/CommentThread.jsx";
import {
  StatusBadge,
  PriorityBadge,
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
  IconUploadCloud,
  IconX,
  IconTrash,
  IconExternalLink,
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
  const [images, setImages] = useState([]);
  const [selectedModalImage, setSelectedModalImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Staff repair upload states
  const [repairFiles, setRepairFiles] = useState([]);
  const [isDraggingRepair, setIsDraggingRepair] = useState(false);
  const [repairError, setRepairError] = useState("");
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairProgress, setRepairProgress] = useState(null);
  const repairFileInputRef = useRef(null);

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
        setImages(data.images || []);
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

  useEffect(() => {
    return () => {
      repairFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [repairFiles]);

  function handleRepairFilesSelect(filesList) {
    setRepairError("");
    const incoming = Array.from(filesList);
    if (!incoming.length) return;

    const currentTotal = images.length + repairFiles.length;
    if (currentTotal + incoming.length > 10) {
      setRepairError(
        `Cannot add ${incoming.length} image(s). A complaint can have at most 10 images (currently has ${currentTotal}).`
      );
      return;
    }

    const validated = [];
    for (const file of incoming) {
      if (
        !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          file.type
        )
      ) {
        setRepairError(
          `"${file.name}" is not a supported image format. Supported formats: PNG, JPG, WebP, GIF.`
        );
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setRepairError(`"${file.name}" exceeds the 5MB size limit.`);
        return;
      }
      validated.push({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setRepairFiles((prev) => [...prev, ...validated]);
  }

  function handleRemoveRepairFile(idToRemove) {
    setRepairFiles((prev) => {
      const item = prev.find((i) => i.id === idToRemove);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== idToRemove);
    });
  }

  async function handleUploadRepairPhotos() {
    if (!repairFiles.length) return;
    setRepairBusy(true);
    setRepairError("");
    setRepairProgress(0);

    try {
      const uploaded = await api.uploadComplaintImages(
        token,
        complaintId,
        repairFiles.map((item) => item.file),
        "repair",
        (pct) => setRepairProgress(pct)
      );

      repairFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setRepairFiles([]);
      setImages((prev) => [...prev, ...uploaded]);
      notify("success", "Repair completion photo(s) uploaded successfully.");
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      setRepairError(err.message || "Failed to upload repair photos.");
    } finally {
      setRepairBusy(false);
      setRepairProgress(null);
    }
  }

  async function handleDeleteImage(image) {
    if (
      !window.confirm(
        `Are you sure you want to delete "${image.original_filename || "this photo"}"?`
      )
    ) {
      return;
    }

    try {
      await api.deleteComplaintImage(token, complaintId, image.id);
      setImages((prev) => prev.filter((img) => img.id !== image.id));
      if (selectedModalImage?.id === image.id) {
        setSelectedModalImage(null);
      }
      notify("success", "Image deleted successfully.");
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      notify("error", err.message || "Failed to delete image.");
    }
  }

  async function handleStatusUpdate(event) {
    event.preventDefault();
    setStatusError("");

    if (!statusValue) {
      setStatusError("Choose a status.");
      return;
    }

    setStatusBusy(true);
    try {
      // If staff has selected repair files, automatically upload them with the status update
      if (repairFiles.length > 0) {
        setRepairBusy(true);
        setRepairProgress(0);
        try {
          const uploaded = await api.uploadComplaintImages(
            token,
            complaintId,
            repairFiles.map((item) => item.file),
            "repair",
            (pct) => setRepairProgress(pct)
          );
          repairFiles.forEach((item) => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          });
          setRepairFiles([]);
          setImages((prev) => [...prev, ...uploaded]);
          notify("success", "Finishing work photo(s) uploaded successfully.");
        } catch (uploadErr) {
          notify(
            "error",
            `Status updated, but finishing photo upload failed: ${uploadErr.message}`
          );
        } finally {
          setRepairBusy(false);
          setRepairProgress(null);
        }
      }

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

  const issueImages = images.filter((img) => img.image_type === "issue");
  const repairImages = images.filter((img) => img.image_type === "repair");

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

            {/* Complaint Issue Photos */}
            <article className="detail-card">
              <div className="card-header-row">
                <h3>Complaint Issue Photos ({issueImages.length})</h3>
              </div>
              {issueImages.length > 0 ? (
                <div className="image-gallery-grid">
                  {issueImages.map((img) => (
                    <div
                      key={img.id}
                      className="image-card"
                      onClick={() => setSelectedModalImage(img)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedModalImage(img);
                        }
                      }}
                    >
                      <div className="image-card-thumb-wrap">
                        <img
                          src={img.image_url}
                          alt={img.original_filename || "Issue photo"}
                          className="image-card-thumb"
                          loading="lazy"
                        />
                      </div>
                      <div className="image-card-meta">
                        <span
                          className="image-card-title"
                          title={img.original_filename}
                        >
                          {img.original_filename || `Photo #${img.id}`}
                        </span>
                        <span className="image-card-date">
                          {formatDate(img.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="unassigned-notice">
                  No issue photos attached to this complaint.
                </p>
              )}
            </article>

            {/* Repair Completion Photos (Restricted to Staff and Admin) */}
            {staff && (
              <article className="detail-card">
                <div className="card-header-row">
                  <h3>Repair Completion Photos ({repairImages.length})</h3>
                  {repairImages.length > 0 && (
                    <span className="preview-tag">Proof of Repair (Admin & Staff View)</span>
                  )}
                </div>

              {repairImages.length > 0 ? (
                <div className="image-gallery-grid">
                  {repairImages.map((img) => (
                    <div
                      key={img.id}
                      className="image-card repair-card"
                      onClick={() => setSelectedModalImage(img)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedModalImage(img);
                        }
                      }}
                    >
                      <div className="image-card-thumb-wrap">
                        <img
                          src={img.image_url}
                          alt={img.original_filename || "Repair completion photo"}
                          className="image-card-thumb"
                          loading="lazy"
                        />
                        <span className="repair-badge-overlay">Repair Proof</span>
                      </div>
                      <div className="image-card-meta">
                        <span
                          className="image-card-title"
                          title={img.original_filename}
                        >
                          {img.original_filename || `Repair #${img.id}`}
                        </span>
                        <span className="image-card-date">
                          {formatDate(img.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="unassigned-notice">
                  {staff
                    ? "No repair completion photos uploaded yet. Use the upload area below to attach proof of repair."
                    : "No repair completion photos uploaded yet. Technicians will attach photos once work is completed."}
                </p>
              )}

              {/* Staff / Admin Upload Control */}
              <div className="repair-upload-section">
                  <h4 className="repair-section-heading">Upload Proof of Repair</h4>
                  <div
                    className={`upload-dropzone ${isDraggingRepair ? "dropzone-dragging" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label="Upload repair completion images"
                    onClick={() => repairFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        repairFileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingRepair(true);
                    }}
                    onDragLeave={() => setIsDraggingRepair(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingRepair(false);
                      if (e.dataTransfer?.files) {
                        handleRepairFilesSelect(e.dataTransfer.files);
                      }
                    }}
                  >
                    <input
                      type="file"
                      ref={repairFileInputRef}
                      style={{ display: "none" }}
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleRepairFilesSelect(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />
                    <IconUploadCloud size={28} className="upload-cloud-icon" />
                    <p className="upload-text">
                      <strong>Click to upload</strong> or drag and drop repair photos
                    </p>
                    <span className="upload-hint">PNG, JPG up to 5MB</span>
                  </div>

                  {repairError && (
                    <Banner
                      type="error"
                      message={repairError}
                      onClose={() => setRepairError("")}
                    />
                  )}

                  {/* Previews before upload */}
                  {repairFiles.length > 0 && (
                    <div className="upload-preview-grid">
                      {repairFiles.map((item) => (
                        <div key={item.id} className="upload-preview-card">
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            className="upload-preview-thumb"
                          />
                          <div className="upload-preview-meta">
                            <span className="upload-preview-name" title={item.name}>
                              {item.name}
                            </span>
                            <span className="upload-preview-size">
                              {(item.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                          <button
                            type="button"
                            className="upload-preview-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveRepairFile(item.id);
                            }}
                            aria-label={`Remove ${item.name}`}
                            disabled={repairBusy}
                          >
                            <IconX size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload progress */}
                  {repairBusy && repairProgress !== null && (
                    <div className="upload-progress-box">
                      <div className="upload-progress-label">
                        <span>Uploading repair photos...</span>
                        <strong>{repairProgress}%</strong>
                      </div>
                      <div className="upload-progress-track">
                        <div
                          className="upload-progress-fill"
                          style={{ width: `${repairProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {repairFiles.length > 0 && (
                    <div className="repair-upload-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleUploadRepairPhotos}
                        disabled={repairBusy}
                      >
                        {repairBusy
                          ? "Uploading..."
                          : `Upload ${repairFiles.length} Repair Photo${repairFiles.length > 1 ? "s" : ""}`}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )}

            {/* Reported By Section (Admin and Staff only) */}
            {staff && (
              <article className="detail-card reported-by-card" data-testid="reported-by-card">
                <h3>Reported By</h3>
                {complaint.reporter ? (
                  <div className="technician-profile-row">
                    <div className="technician-avatar">
                      {(complaint.reporter.full_name || complaint.reporter.username || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="technician-info">
                      {complaint.reporter.full_name ? (
                        <>
                          <strong className="reporter-fullname">
                            {complaint.reporter.full_name}
                          </strong>
                          <small className="reporter-username">
                            {complaint.reporter.username}
                          </small>
                        </>
                      ) : (
                        <>
                          <strong className="reporter-username">
                            {complaint.reporter.username}
                          </strong>
                          <small>Complaint Creator</small>
                        </>
                      )}
                    </div>
                    <span className="assigned-date">
                      {formatDate(complaint.created_at)}
                    </span>
                  </div>
                ) : (
                  <p className="unassigned-notice">
                    Reporter information unavailable.
                  </p>
                )}
              </article>
            )}

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

      {/* Lightbox / Full-size photo modal */}
      {selectedModalImage && (
        <div
          className="image-modal-backdrop"
          onClick={() => setSelectedModalImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="image-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="image-modal-header">
              <div className="image-modal-title-wrap">
                <h4>{selectedModalImage.original_filename || "Photo"}</h4>
                <span
                  className={`image-type-pill ${selectedModalImage.image_type === "repair" ? "pill-repair" : "pill-issue"}`}
                >
                  {selectedModalImage.image_type === "repair"
                    ? "Repair Proof"
                    : "Issue Photo"}
                </span>
              </div>
              <div className="image-modal-actions">
                <a
                  href={selectedModalImage.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="image-modal-btn"
                  title="Open full resolution in new tab"
                >
                  <IconExternalLink size={16} />
                </a>
                {(session?.role === "admin" ||
                  session?.userId === selectedModalImage.user_id) && (
                  <button
                    type="button"
                    className="image-modal-btn btn-danger"
                    onClick={() => handleDeleteImage(selectedModalImage)}
                    title="Delete image"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="image-modal-btn btn-close"
                  onClick={() => setSelectedModalImage(null)}
                  title="Close"
                >
                  <IconX size={18} />
                </button>
              </div>
            </div>

            <div className="image-modal-body">
              <img
                src={selectedModalImage.image_url}
                alt={selectedModalImage.original_filename || "Complaint Photo"}
                className="image-modal-full"
              />
            </div>

            <div className="image-modal-footer">
              <span>Uploaded: {formatDate(selectedModalImage.created_at)}</span>
              {selectedModalImage.file_size && (
                <span>
                  Size: {(selectedModalImage.file_size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
