import StatCard from "../components/StatCard.jsx";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Spinner } from "../components/ui.jsx";
import { normalizeStatus } from "../utils.js";

export default function UserDashboard({
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
  const inProgress = complaints.filter(
    (item) => normalizeStatus(item.status) === "in_progress"
  ).length;
  const resolved = complaints.filter(
    (item) => normalizeStatus(item.status) === "resolved"
  ).length;

  const cards = [
    { label: "Total Complaints", value: total },
    { label: "Open", value: open },
    { label: "In Progress", value: inProgress },
    { label: "Resolved", value: resolved },
  ];

  const recent = complaints.slice(0, 5);

  return (
    <>
      <section className="welcome" data-testid="user-dashboard">
        <h2>Welcome back, {session.username}!</h2>
        <p>Here&apos;s an overview of your service requests.</p>
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
            <p>Your latest service requests</p>
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
                ? "Submit your first complaint to see it here."
                : undefined
            }
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            showAssignee={false}
          />
        )}
      </section>
    </>
  );
}
