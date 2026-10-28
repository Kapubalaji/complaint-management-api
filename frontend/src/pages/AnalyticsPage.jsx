import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import StatCard from "../components/StatCard.jsx";
import { Spinner, EmptyState } from "../components/ui.jsx";
import { isStaffRole, statusLabel } from "../utils.js";

const TREND_LIMIT = 14;

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function BreakdownList({ title, hint, entries, total, toneFor }) {
  return (
    <section className="analytics-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
      </div>

      <ul className="breakdown-list">
        {entries.map(([label, value]) => (
          <li key={label} className="breakdown-row">
            <span className={`breakdown-label${toneFor ? ` ${toneFor(label)}` : ""}`}>
              {label}
            </span>
            <span className="breakdown-track" aria-hidden="true">
              <span
                className="breakdown-fill"
                style={{ width: `${percent(value, total)}%` }}
              />
            </span>
            <span className="breakdown-value">
              {value}
              <small>{percent(value, total)}%</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrendChart({ trend }) {
  const days = trend.slice(-TREND_LIMIT);
  const peak = Math.max(
    1,
    ...days.flatMap((point) => [point.created, point.resolved])
  );
  const truncated = trend.length > days.length;

  return (
    <section className="analytics-panel">
      <div className="panel-heading">
        <div>
          <h2>Trends</h2>
          <p>
            Created vs resolved over the last {days.length} days
            {truncated
              ? ` · ${days.length}-day view of the ${trend.length}-day API window`
              : ""}
          </p>
        </div>
        <div className="trend-legend">
          <span className="legend-item legend-created">Created</span>
          <span className="legend-item legend-resolved">Resolved</span>
        </div>
      </div>

      <div className="trend-chart" role="img" aria-label="Daily created and resolved complaints">
        {days.map((point) => (
          <div key={point.date} className="trend-day" title={`${point.date}: ${point.created} created, ${point.resolved} resolved`}>
            <span className="trend-bars">
              <span
                className="trend-bar trend-bar-created"
                style={{ height: `${(point.created / peak) * 100}%` }}
              />
              <span
                className="trend-bar trend-bar-resolved"
                style={{ height: `${(point.resolved / peak) * 100}%` }}
              />
            </span>
            <small>{point.date.slice(5)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkloadPanel({ analytics }) {
  const rows = analytics.staff_workload || [];
  const mine = analytics.my_workload;

  return (
    <section className="analytics-panel">
      <div className="panel-heading">
        <div>
          <h2>Staff Workload</h2>
          <p>Active, total, and resolved complaints per staff member</p>
        </div>
      </div>

      {mine && (
        <div className="my-workload" data-testid="my-workload">
          <StatCard label="My Active" value={mine.active_count} />
          <StatCard label="My Total" value={mine.total_count} />
          <StatCard label="My Resolved" value={mine.resolved_count} />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No staff assignments yet."
          hint="Workload appears once complaints are assigned."
        />
      ) : (
        <div className="table-wrap">
          <table className="complaint-table workload-table" data-testid="staff-workload">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Active</th>
                <th>Total</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <td>{person.full_name || person.username}</td>
                  <td>{person.active_count}</td>
                  <td>{person.total_count}</td>
                  <td>{person.resolved_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AnalyticsPage({ session, notify, handleError }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const staff = isStaffRole(session.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAnalytics(session.token);
      setAnalytics(data);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [session.token, handleError]);

  useEffect(() => {
    let cancelled = false;
    api.getAnalytics(session.token).then(
      (data) => {
        if (!cancelled) {
          setAnalytics(data);
          setLoading(false);
        }
      },
      (err) => {
        if (!cancelled) {
          setLoading(false);
          handleError(err);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [session.token, handleError]);

  async function handleExport() {
    if (exportStart && exportEnd && exportStart > exportEnd) {
      handleError(
        new Error("Export start date must be on or before the end date.")
      );
      return;
    }
    const hasRange = Boolean(exportStart || exportEnd);
    setExporting(true);
    try {
      const csv = hasRange
        ? await api.downloadReportCsv(session.token, {
            startDate: exportStart,
            endDate: exportEnd,
          })
        : await api.downloadReportCsv(session.token);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "complaints-report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      notify("success", "Report downloaded.");
    } catch (err) {
      handleError(err);
    } finally {
      setExporting(false);
    }
  }

  if (loading && !analytics) {
    return (
      <section className="analytics-panel">
        <Spinner label="Loading analytics..." />
      </section>
    );
  }

  if (!analytics) {
    return (
      <section className="analytics-panel">
        <EmptyState
          title="Analytics unavailable."
          hint="We could not load report data right now."
        />
        <button className="secondary-button" type="button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const totals = analytics.totals || {};
  const total = totals.total || 0;
  const resolution = analytics.resolution || {};
  const statusEntries = ["open", "in_progress", "resolved", "closed"].map(
    (key) => [statusLabel(key), totals[key] || 0]
  );
  const priorityEntries = Object.entries(analytics.by_priority || {});
  const categoryEntries = Object.entries(analytics.by_category || {});
  const sentimentEntries = Object.entries(analytics.by_sentiment || {});

  return (
    <>
      <section className="analytics-toolbar">
        <div className="scope-note" data-testid="analytics-scope">
          <strong>
            {analytics.scope === "user" ? "Your complaints" : "All complaints"}
          </strong>
          <span>
            Live database report · generated{" "}
            {new Date(analytics.generated_at).toLocaleString()}
          </span>
        </div>

        <div className="panel-actions">
          <div className="export-range" data-testid="export-range">
            <input
              type="date"
              value={exportStart}
              onChange={(event) => setExportStart(event.target.value)}
              aria-label="Export start date"
              max={exportEnd || undefined}
            />
            <input
              type="date"
              value={exportEnd}
              onChange={(event) => setExportEnd(event.target.value)}
              aria-label="Export end date"
              min={exportStart || undefined}
            />
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Preparing..." : "Export CSV"}
          </button>
        </div>
      </section>

      <section className="stats">
        <StatCard label="Total" value={total} />
        <StatCard label="Open" value={totals.open || 0} />
        <StatCard label="In Progress" value={totals.in_progress || 0} />
        <StatCard label="Resolved" value={totals.resolved || 0} />
        <StatCard label="Closed" value={totals.closed || 0} />
        {staff && <StatCard label="Unassigned" value={totals.unassigned || 0} />}
      </section>

      <div className="analytics-grid">
        <BreakdownList
          title="Status"
          hint="Complaints by workflow status"
          entries={statusEntries}
          total={total}
        />
        <BreakdownList
          title="Priority"
          hint="Complaints by AI-assigned priority"
          entries={priorityEntries}
          total={total}
          toneFor={(label) => `tone-${String(label).toLowerCase()}`}
        />
        <BreakdownList
          title="Category"
          hint="Complaints by category"
          entries={categoryEntries}
          total={total}
        />
        <BreakdownList
          title="Sentiment"
          hint="Complaints by detected sentiment"
          entries={sentimentEntries}
          total={total}
        />
      </div>

      <section className="analytics-panel">
        <div className="panel-heading">
          <div>
            <h2>Resolution Performance</h2>
            <p>Based on resolved timestamps in the database</p>
          </div>
        </div>
        <section className="stats">
          <StatCard
            label="Resolution Rate"
            value={`${Math.round((resolution.resolution_rate || 0) * 100)}%`}
          />
          <StatCard label="Resolved Count" value={resolution.resolved_count || 0} />
          <StatCard
            label="Avg. Resolution"
            value={
              resolution.avg_resolution_hours == null
                ? "—"
                : `${resolution.avg_resolution_hours}h`
            }
          />
          <StatCard label="Sample Size" value={resolution.total_count || 0} />
        </section>
      </section>

      <TrendChart trend={analytics.trend || []} />

      {staff && <WorkloadPanel analytics={analytics} />}
    </>
  );
}
