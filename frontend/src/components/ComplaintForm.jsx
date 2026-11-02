import { useState } from "react";
import * as api from "../api.js";
import { CATEGORIES, PRIORITIES } from "../constants.js";
import AiInsights from "./AiInsights.jsx";
import { Banner } from "./ui.jsx";
import { IconUploadCloud } from "./Icons.jsx";

export default function ComplaintForm({
  token,
  session,
  staffMap = {},
  editing = null,
  onSaved,
  onCancel,
  notify,
}) {
  const isEditing = Boolean(editing);

  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [category, setCategory] = useState(editing?.category || "General");
  const [priority, setPriority] = useState(editing?.priority || "Medium");

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");

  async function handlePreview(event) {
    event.preventDefault();
    setPreviewError("");

    if (!title.trim() || !description.trim()) {
      setPreviewError("Enter a title and description before running AI preview.");
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await api.previewAi(token, title.trim(), description.trim());
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setPreviewError(err.message || "AI preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!title.trim() || !description.trim()) {
      setFormError("Please enter both a title and a description.");
      return;
    }

    setSubmitting(true);

    try {
      let saved;

      if (isEditing) {
        const changes = {
          title: title.trim(),
          description: description.trim(),
        };
        if (category) changes.category = category;
        if (priority) changes.priority = priority;

        saved = await api.patchComplaint(token, editing.id, changes);
        notify("success", `Complaint #${editing.id} updated successfully.`);
      } else {
        const payload = {
          title: title.trim(),
          description: description.trim(),
          status: "open",
        };
        if (category) payload.category = category;
        if (priority) payload.priority = priority;

        saved = await api.createComplaint(token, payload);
        notify(
          "success",
          "Complaint submitted. AI triage results are now attached."
        );
      }

      onSaved(saved);
    } catch (err) {
      setFormError(err.message || "Unable to save the complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="complaints-panel form-panel">
      <div className="form-layout">
        <div className="form-main">
          <h2>{isEditing ? `Edit Complaint #${editing.id}` : "Create Complaint"}</h2>
          <p>
            {isEditing
              ? "Update the details of your complaint. AI fields stay intact unless you change them."
              : "Describe your issue in detail. AI triage categorizes and routes it automatically."}
          </p>

          <form className="complaint-form" onSubmit={handleSubmit}>
            <div className="form-grid-two">
              <div className="form-field">
                <label htmlFor="complaint-title">
                  Title <span className="required-star">*</span>
                </label>
                <input
                  id="complaint-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Internet not working"
                  maxLength={200}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="complaint-category">
                  Category <span className="required-star">*</span>
                </label>
                <select
                  id="complaint-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {!isEditing && <option value="">Select Category</option>}
                  {CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="complaint-priority">
                Priority <span className="required-star">*</span>
              </label>
              <select
                id="complaint-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {!isEditing && <option value="">Select Priority</option>}
                {PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="complaint-description">
                Description <span className="required-star">*</span>
              </label>
              <textarea
                id="complaint-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe your issue in detail..."
                rows="5"
                required
              />
            </div>

            {/* Styled Drag & Drop Upload Zone (Screen 08) */}
            <div className="form-field">
              <label>Upload Image (Optional)</label>
              <div className="upload-dropzone" role="region" aria-label="Image upload area">
                <IconUploadCloud size={34} className="upload-cloud-icon" />
                <p className="upload-text">
                  <strong>Click to upload</strong> or drag and drop
                </p>
                <span className="upload-hint">PNG, JPG up to 5MB</span>
                <span className="upload-status-note">
                  (Image upload preview mode — server attachment storage coming soon)
                </span>
              </div>
            </div>

            <Banner
              type="error"
              message={formError}
              onClose={() => setFormError("")}
            />

            <div className="form-actions-row">
              <button
                className="secondary-button"
                type="button"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>

              {!isEditing && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading || submitting}
                >
                  {previewLoading ? "Analyzing..." : "Preview AI analysis"}
                </button>
              )}

              <button
                className="primary-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Submit Complaint"}
              </button>
            </div>
          </form>
        </div>

        {!isEditing && (
          <aside className="form-aside">
            <AiInsights
              analysis={preview}
              staffMap={staffMap}
              session={session}
              loading={previewLoading}
              note={
                preview
                  ? "Preview only. Submitting runs the same analysis server-side and stores the result on the complaint."
                  : "Run a preview to see how AI will classify this complaint before submitting."
              }
            />
            {previewError && (
              <Banner
                type="error"
                message={previewError}
                onClose={() => setPreviewError("")}
              />
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
