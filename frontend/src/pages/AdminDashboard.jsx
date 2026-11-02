import { useEffect, useMemo, useState } from "react";
import * as api from "../api.js";
import StatCard from "../components/StatCard.jsx";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Spinner } from "../components/ui.jsx";
import { normalizeStatus } from "../utils.js";
import {
  IconComplaints,
  IconClock,
  IconInbox,
  IconCheckCircle,
} from "../components/Icons.jsx";
import {
  ComplaintsOverviewChart,
  TopCategoriesDonutChart,
} from "../components/SvgCharts.jsx";

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
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!session?.token) return undefined;
    let cancelled = false;

    api
      .getAnalytics(session.token)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.token]);

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
    {
      label: "Total Complaints",
      value: total,
      accent: "total",
      icon: <IconComplaints size={24} />,
    },
    {
      label: "Open",
      value: open,
      accent: "open",
      icon: <IconClock size={24} />,
    },
    {
      label: "In Progress",
      value: inProgress,
      accent: "progress",
      icon: <IconInbox size={24} />,
    },
    {
      label: "Resolved",
      value: resolved,
      accent: "resolved",
      icon: <IconCheckCircle size={24} />,
    },
  ];

  // Actual trend data from /reports/analytics API
  const trendPoints = useMemo(() => {
    if (!analytics?.trend || !Array.isArray(analytics.trend)) return [];
    return analytics.trend.slice(-14).map((point) => ({
      label: point.date ? point.date.slice(5) : "",
      value: point.created || 0,
    }));
  }, [analytics?.trend]);

  // Actual category counts from /reports/analytics or current complaints
  const categoryData = useMemo(() => {
    const counts = {};
    if (analytics?.by_category && typeof analytics.by_category === "object") {
      Object.entries(analytics.by_category).forEach(([cat, val]) => {
        if (typeof val === "number" && val > 0) {
          counts[cat] = val;
        }
      });
    } else if (Array.isArray(complaints) && complaints.length > 0) {
      complaints.forEach((c) => {
        const cat = c.category || "General";
        counts[cat] = (counts[cat] || 0) + 1;
      });
    }

    const categoryColors = [
      "#3b82f6",
      "#f97316",
      "#06b6d4",
      "#10b981",
      "#8b5cf6",
      "#ec4899",
      "#6366f1",
    ];

    return Object.entries(counts).map(([label, value], idx) => ({
      label,
      value,
      color: categoryColors[idx % categoryColors.length],
    }));
  }, [analytics?.by_category, complaints]);

  const recent = complaints.slice(0, 5);

  return (
    <>
      <section className="welcome" data-testid="admin-dashboard">
        <h2>Welcome back, {session.username}!</h2>
        <p>Here&apos;s the current state of complaints across the organization.</p>
      </section>

      <section className="stats">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            accent={card.accent}
            icon={card.icon}
          />
        ))}
      </section>

      {/* Dual Analytics Visuals Section (Screen 07) */}
      <section className="dashboard-charts-grid">
        <article className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Complaints Overview</h3>
              <p>Activity trend across time</p>
            </div>
            <span className="chart-pill-tag">Recent Activity</span>
          </div>
          <ComplaintsOverviewChart data={trendPoints} />
        </article>

        <article className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Top Categories</h3>
              <p>Distribution by issue category</p>
            </div>
          </div>
          <TopCategoriesDonutChart data={categoryData} />
        </article>
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
