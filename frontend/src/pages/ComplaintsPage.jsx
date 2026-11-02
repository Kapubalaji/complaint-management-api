import { useEffect, useState, useMemo } from "react";
import * as api from "../api.js";
import ComplaintTable from "../components/ComplaintTable.jsx";
import { Banner } from "../components/ui.jsx";
import {
  CATEGORIES,
  PRIORITIES,
  STATUS_FILTERS,
} from "../constants.js";
import { normalizeStatus, canCreateComplaints } from "../utils.js";
import { IconSearch, IconArrowLeft } from "../components/Icons.jsx";

const PAGE_SIZE = 10;

function filterComplaints(items, search, status, priority, category) {
  const query = search.trim().toLowerCase();

  return items.filter((item) => {
    const matchesSearch =
      !query ||
      String(item.id).includes(query) ||
      (item.title || "").toLowerCase().includes(query) ||
      (item.description || "").toLowerCase().includes(query) ||
      (item.category || "").toLowerCase().includes(query);

    const matchesStatus =
      status === "All" || normalizeStatus(item.status) === normalizeStatus(status);

    const matchesPriority =
      priority === "All" ||
      (item.priority || "Medium").toLowerCase() === priority.toLowerCase();

    const matchesCategory =
      category === "All" || (item.category || "General") === category;

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });
}

export default function ComplaintsPage({
  mode,
  token,
  session,
  complaints,
  loading,
  staffMap = {},
  onView,
  onEdit,
  onDelete,
  onNewComplaint,
  notify,
  handleError,
  onComplaintsChanged,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [category, setCategory] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const isQueueMode = mode === "unassigned" || mode === "queue";
  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(isQueueMode);
  const [queueError, setQueueError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isQueueMode) return undefined;
    let cancelled = false;

    const request =
      mode === "unassigned"
        ? api.getUnassigned(token)
        : api.getAssignedToMe(token);

    request.then(
      (data) => {
        if (cancelled) return;
        setQueueItems(data);
        setQueueError("");
        setQueueLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setQueueLoading(false);
        if (err.status === 401 || err.status === 403) {
          handleError(err);
          return;
        }
        setQueueError(err.message || "Unable to load the queue.");
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isQueueMode, mode, token, handleError, tick]);

  const source = isQueueMode ? queueItems : complaints;
  const initialLoading = isQueueMode ? queueLoading : loading;
  const filtered = useMemo(
    () => filterComplaints(source, search, status, priority, category),
    [source, search, status, priority, category]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const heading =
    mode === "unassigned"
      ? "Unassigned Complaints"
      : mode === "queue"
        ? "Assigned to You"
        : session.role === "user" || session.role === "staff"
          ? "My Complaints"
          : "All Complaints";

  const emptyTitle = (() => {
    if (source.length > 0) return "No complaints match your filters.";
    if (mode === "unassigned") return "Every complaint has an owner.";
    if (mode === "queue") return "No complaints are assigned to you.";
    if (session.role === "user")
      return "You haven't submitted any complaints yet.";
    if (session.role === "staff")
      return "No complaints are assigned to you.";
    return "No complaints in the system yet.";
  })();

  async function handleAssignToMe(item) {
    try {
      const updated = await api.assignComplaint(token, item.id, session.userId);
      notify("success", `Complaint #${updated.id} assigned to you.`);
      if (isQueueMode) {
        setQueueLoading(true);
        setTick((value) => value + 1);
      }
      onComplaintsChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleError(err);
        return;
      }
      notify("error", err.message || "Unable to assign complaint.");
    }
  }

  return (
    <section className="complaints-panel">
      <div className="panel-heading">
        <div>
          <h2>{heading}</h2>
          <p>
            {filtered.length} of {source.length} complaint
            {source.length === 1 ? "" : "s"} shown
          </p>
        </div>

        <div className="panel-actions">
          {isQueueMode ? (
            <button
              className="secondary-button"
              onClick={() => {
                setQueueError("");
                setQueueLoading(true);
                setTick((value) => value + 1);
              }}
              disabled={queueLoading}
            >
              {queueLoading ? "Refreshing..." : "Refresh"}
            </button>
          ) : canCreateComplaints(session) ? (
            <button className="primary-button" onClick={onNewComplaint}>
              + New Complaint
            </button>
          ) : null}
        </div>
      </div>

      {/* Reference Filter Bar (Screen 05) */}
      <div className="filters-bar-reference">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setCurrentPage(1);
          }}
          aria-label="Filter by status"
          className="filter-select"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>
              {option === "All" ? "All Status" : option}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setCurrentPage(1);
          }}
          aria-label="Filter by category"
          className="filter-select"
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
            setCurrentPage(1);
          }}
          aria-label="Filter by priority"
          className="filter-select"
        >
          <option value="All">All Priorities</option>
          {PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <div className="search-input-wrap">
          <IconSearch size={16} className="search-icon-inside" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search complaint..."
            aria-label="Search complaints"
          />
        </div>
      </div>

      {isQueueMode && queueError && (
        <Banner
          type="error"
          message={queueError}
          onClose={() => setQueueError("")}
        />
      )}

      <ComplaintTable
        items={paginatedItems}
        session={session}
        staffMap={staffMap}
        loading={initialLoading}
        emptyTitle={emptyTitle}
        emptyHint={
          source.length > 0
            ? "Try clearing the search or filters."
            : undefined
        }
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onAssignToMe={
          mode === "unassigned" && session.role === "admin"
            ? handleAssignToMe
            : undefined
        }
        showAssignee={session.role !== "user"}
      />

      {/* Pagination Bar (Screen 05: < 1 2 3 >) */}
      {totalPages > 1 && (
        <div className="pagination-bar">
          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            &lt;
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
            <button
              key={pg}
              type="button"
              className={`pagination-num ${pg === currentPage ? "active" : ""}`}
              onClick={() => setCurrentPage(pg)}
            >
              {pg}
            </button>
          ))}
          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            &gt;
          </button>
        </div>
      )}
    </section>
  );
}
