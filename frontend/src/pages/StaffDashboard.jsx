import StatCard from "../components/StatCard.jsx";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Spinner } from "../components/ui.jsx";
import { normalizeStatus } from "../utils.js";

export default function StaffDashboard({
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
  // Staff GET /complaints returns only complaints assigned to this staff member
  const assigned = complaints;
  const total = assigned.length;
  const open = assigned.filter(
    (item) => normalizeStatus(item.status) === "open"
  ).length;
  const inProgress = assigned.filter(
    (item) => normalizeStatus(item.status) === "in_progress"
  ).length;
  const resolved = assigned.filter(
    (item) => normalizeStatus(item.status) === "resolved"
  ).length;

  const cards = [
    { label: "Assigned to Me", value: total },
    { label: "Open", value: open },
    { label: "In Progress", value: inProgress },
    { label: "Resolved", value: resolved },
  ];

  const recent = assigned.slice(0, 5);

  return (
    <>
      <section className="welcome" data-testid="staff-dashboard">
        <h2>Welcome back, {session.username}!</h2>
        <p>Here&apos;s your triage overview and current assigned workload.</p>
      </section>

      <section className="stats">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="complaints-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent Assigned Complaints</h2>
            <p>Complaints currently assigned to you</p>
          </div>

          <button
            className="secondary-button"
            onClick={() => onNavigate("queue")}
          >
            Open my queue
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
                ? "No complaints assigned to you."
                : "Nothing to display."
            }
            emptyHint={
              complaints.length === 0
                ? "Assigned complaints will appear here when an admin assigns them."
                : undefined
            }
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            showAssignee
          />
        )}
      </section>
    </>
  );
}
