import { statusClass, statusLabel, normalizeStatus } from "../utils.js";

export function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${statusClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const value = String(priority || "Medium").toLowerCase();
  return <span className={`badge priority-badge priority-${value}`}>{priority || "Medium"}</span>;
}

export function SentimentBadge({ sentiment }) {
  if (!sentiment) return <span className="badge sentiment-neutral">Neutral</span>;
  const value = String(sentiment).toLowerCase().replace(/\s+/g, "-");
  return <span className={`badge sentiment-badge sentiment-${value}`}>{sentiment}</span>;
}

export function CategoryBadge({ category }) {
  if (!category) return <span className="badge category-badge">General</span>;
  const value = String(category).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <span className={`badge category-badge category-${value}`}>{category}</span>;
}

export function RoleBadge({ role }) {
  const value = normalizeStatus(role) || "user";
  return <span className={`role-badge role-${value}`}>{role || "user"}</span>;
}
