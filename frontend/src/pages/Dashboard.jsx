import StatCard from "../components/StatCard.jsx";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Spinner } from "../components/ui.jsx";
import { normalizeStatus, isStaffRole } from "../utils.js";

export default function Dashboard({
  session,
  complaints,
  loading,
  hasLoaded,
  staffMap = {},
  onView,
  onEdit,
  onDelete,
  onNavigate,
}) {
  const staff = isStaffRole(session.role);

  const total = complaints.length;
  const open = complaints.filter(
    (item) => normalizeStatus(item.status) === "open"
  ).length;
  const inProgress = complaints.filter(
    (item) => normalizeStatus(item.status) === "in_progress"
  ).length;
  const resolved = complaints.filter(
    (item) => normalizeStatus(item.status) === "resolved"
  ).length;
  const unassigned = complaints.filter(
    (item) => item.assigned_staff_id == null
  ).length;
  const mineQueue = complaints.filter(
    (item) => item.assigned_staff_id === session.userId
  ).length;

  const cards = staff
    ? session.role === "admin"
      ? [
          { label: "Total Complaints", value: total },
          { label: "Open", value: open },
          { label: "Unassigned", value: unassigned },
          { label: "Resolved", value: resolved },
        ]
      : [
          { label: "Total Complaints", value: total },
          { label: "Open", value: open },
          { label: "Unassigned", value: unassigned },
          { label: "Assigned to Me", value: mineQueue },
        ]
    : [
        { label: "Total Complaints", value: total },
        { label: "Open", value: open },
        { label: "In Progress", value: inProgress },
        { label: "Resolved", value: resolved },
      ];

  const recent = complaints.slice(0, 5);

  return (
    <>
      <section className="welcome">
        <h2>Welcome back, {session.username}!</h2>
        <p>
          {session.role === "user"
            ? "Here's an overview of your service requests."
            : session.role === "admin"
              ? "Here's the current state of complaints across the organization."
              : "Here's your triage overview and current workload."}
        </p>
      </section>

      <section className="stats">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="complaints-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent Complaints</h2>
            <p>{staff ? "Latest complaints across the system" : "Your latest service requests"}</p>
          </div>

          <button
            className="secondary-button"
            onClick={() => onNavigate("complaints")}
          >
            View all
          </button>
        </div>

        {loading && !hasLoaded ? (
          <Spinner label="Loading complaints..." />
        ) : (
          <ComplaintTable
            items={recent}
            session={session}
            staffMap={staffMap}
            loading={loading}
            emptyTitle={
              complaints.length === 0
                ? "No complaints yet."
                : "Nothing to display."
            }
            emptyHint={
              complaints.length === 0
                ? session.role === "user"
                  ? "Submit your first complaint to see it here."
                  : "New complaints will appear here as they arrive."
                : undefined
            }
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            showAssignee={staff}
          />
        )}
      </section>
    </>
  );
}
