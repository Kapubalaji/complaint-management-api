import { Spinner, EmptyState } from "./ui.jsx";
import { StatusBadge, PriorityBadge, CategoryBadge } from "./badges.jsx";
import {
  canEditComplaint,
  canDeleteComplaint,
  canAssignComplaints,
  formatDay,
  resolveUserLabel,
} from "../utils.js";

export default function ComplaintTable({
  items,
  session,
  staffMap = {},
  loading = false,
  emptyTitle = "No complaints to show.",
  emptyHint,
  onView,
  onEdit,
  onDelete,
  onAssignToMe,
  showAssignee = true,
}) {
  if (loading) {
    return <Spinner label="Loading complaints..." />;
  }

  if (!items || items.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="table-wrapper">
      <table className="complaint-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Complaint</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            {showAssignee && <th>Assigned</th>}
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const editable = canEditComplaint(item, session);
            const deletable = canDeleteComplaint(item, session);
            const canAssignSelf =
              onAssignToMe &&
              canAssignComplaints(session) &&
              item.assigned_staff_id !== session.userId;

            return (
              <tr key={item.id}>
                <td>#{item.id}</td>
                <td className="table-title-cell">
                  <button
                    type="button"
                    className="link-button table-title"
                    onClick={() => onView(item)}
                  >
                    {item.title}
                  </button>
                  <span className="table-description">{item.description}</span>
                </td>
                <td>
                  <CategoryBadge category={item.category} />
                </td>
                <td>
                  <PriorityBadge priority={item.priority} />
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                {showAssignee && (
                  <td className="table-secondary">
                    {resolveUserLabel(item.assigned_staff_id, session, staffMap)}
                  </td>
                )}
                <td className="table-secondary">{formatDay(item.created_at)}</td>
                <td className="action-buttons">
                  <button
                    type="button"
                    className="view-button"
                    onClick={() => onView(item)}
                  >
                    View
                  </button>

                  {canAssignSelf && (
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => onAssignToMe(item)}
                    >
                      Assign to me
                    </button>
                  )}

                  {editable && (
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => onEdit(item)}
                    >
                      Edit
                    </button>
                  )}

                  {deletable && (
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => onDelete(item)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
