import { useState, useRef, useEffect } from "react";
import * as api from "../api.js";
import { CATEGORIES, PRIORITIES } from "../constants.js";
import AiInsights from "./AiInsights.jsx";
import { Banner } from "./ui.jsx";
import { IconUploadCloud, IconX } from "./Icons.jsx";

const MAX_PHOTOS = 5;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

  // Selected images state
  const [selectedImages, setSelectedImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imageError, setImageError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  // Revoke preview URLs on unmount
  useEffect(() => {
    return () => {
      selectedImages.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [selectedImages]);

  function handleFiles(filesList) {
    setImageError("");
    const incoming = Array.from(filesList);
    if (!incoming.length) return;

    if (selectedImages.length + incoming.length > MAX_PHOTOS) {
      setImageError(`You can upload at most ${MAX_PHOTOS} images per complaint.`);
      return;
    }

    const validated = [];
    for (const file of incoming) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setImageError(`"${file.name}" is not a supported image format. Supported formats: PNG, JPG, WebP, GIF.`);
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setImageError(`"${file.name}" exceeds the 5MB size limit.`);
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

    setSelectedImages((prev) => [...prev, ...validated]);
  }

  function handleRemoveImage(idToRemove) {
    setSelectedImages((prev) => {
      const item = prev.find((i) => i.id === idToRemove);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== idToRemove);
    });
  }

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

        // Upload any newly selected images if updating
        if (selectedImages.length > 0) {
          setUploadProgress(0);
          await api.uploadComplaintImages(
            token,
            editing.id,
            selectedImages.map((item) => item.file),
            "issue",
            (pct) => setUploadProgress(pct)
          );
        }
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

        // Upload selected images attached to newly created complaint
        if (selectedImages.length > 0) {
          setUploadProgress(0);
          try {
            await api.uploadComplaintImages(
              token,
              saved.id,
              selectedImages.map((item) => item.file),
              "issue",
              (pct) => setUploadProgress(pct)
            );
            notify(
              "success",
              "Complaint submitted with photo(s). AI triage results attached."
            );
          } catch (uploadErr) {
            notify(
              "error",
              `Complaint #${saved.id} created, but image upload failed: ${uploadErr.message}`
            );
          }
        } else {
          notify(
            "success",
            "Complaint submitted. AI triage results are now attached."
          );
        }
      }

      onSaved(saved);
    } catch (err) {
      setFormError(err.message || "Unable to save the complaint.");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
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
              <label>Upload Images (Optional)</label>
              <div
                className={`upload-dropzone ${isDragging ? "dropzone-dragging" : ""}`}
                role="button"
                tabIndex={0}
                aria-label="Image upload area"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer?.files) {
                    handleFiles(e.dataTransfer.files);
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <IconUploadCloud size={34} className="upload-cloud-icon" />
                <p className="upload-text">
                  <strong>Click to upload</strong> or drag and drop
                </p>
                <span className="upload-hint">
                  PNG, JPG, WebP, GIF up to 5MB (Max {MAX_PHOTOS} photos)
                </span>
              </div>

              {imageError && (
                <Banner
                  type="error"
                  message={imageError}
                  onClose={() => setImageError("")}
                />
              )}

              {/* Previews of selected images */}
              {selectedImages.length > 0 && (
                <div className="upload-preview-grid">
                  {selectedImages.map((img) => (
                    <div key={img.id} className="upload-preview-card">
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="upload-preview-thumb"
                      />
                      <div className="upload-preview-meta">
                        <span className="upload-preview-name" title={img.name}>
                          {img.name}
                        </span>
                        <span className="upload-preview-size">
                          {(img.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        className="upload-preview-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(img.id);
                        }}
                        aria-label={`Remove ${img.name}`}
                        title="Remove image"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload progress indicator */}
              {submitting && uploadProgress !== null && (
                <div className="upload-progress-box">
                  <div className="upload-progress-label">
                    <span>Uploading images...</span>
                    <strong>{uploadProgress}%</strong>
                  </div>
                  <div className="upload-progress-track">
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
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
