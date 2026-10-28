export function Spinner({ label = "Loading..." }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

export function Banner({ type = "error", message, onClose }) {
  if (!message) return null;

  return (
    <div
      className={type === "success" ? "success-message" : "error-message"}
      role={type === "success" ? "status" : "alert"}
    >
      <span>{message}</span>
      {onClose && (
        <button
          type="button"
          className="banner-close"
          onClick={onClose}
          aria-label="Dismiss message"
        >
          &times;
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
