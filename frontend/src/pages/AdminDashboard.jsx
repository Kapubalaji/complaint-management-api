import StatCard from "../components/StatCard.jsx";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Spinner } from "../components/ui.jsx";
import { normalizeStatus } from "../utils.js";

export default function AdminDashboard({
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
  const total = complaints.length;
  const open = complaints.filter(
    (item) => normalizeStatus(item.status) === "open"
  ).length;
  const resolved = complaints.filter(
    (item) => normalizeStatus(item.status) === "resolved"
  ).length;
  const unassigned = complaints.filter(
    (item) => item.assigned_staff_id == null
  ).length;

  const cards = [
    { label: "Total Complaints", value: total },
    { label: "Open", value: open },
    { label: "Unassigned", value: unassigned },
    { label: "Resolved", value: resolved },
  ];

  const recent = complaints.slice(0, 5);

  return (
    <>
      <section className="welcome" data-testid="admin-dashboard">
        <h2>Welcome back, {session.username}!</h2>
        <p>Here&apos;s the current state of complaints across the organization.</p>
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
            <p>Latest complaints across the system — assign owners from Unassigned</p>
          </div>

          <div className="panel-actions">
            <button
              className="secondary-button"
              onClick={() => onNavigate("unassigned")}
            >
              Unassigned queue
            </button>
            <button
              className="primary-button"
              onClick={() => onNavigate("users")}
            >
              Manage users
            </button>
          </div>
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
                ? "New complaints will appear here as they arrive."
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
