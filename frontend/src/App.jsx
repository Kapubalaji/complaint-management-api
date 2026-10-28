import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import * as api from "./api.js";
import { readSession, saveSession, clearSession } from "./auth.js";
import { menuForRole, PAGE_META } from "./constants.js";
import { buildStaffMap, isStaffRole } from "./utils.js";
import AuthPages from "./pages/AuthPages.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { Banner } from "./components/ui.jsx";
import { RoleBadge } from "./components/badges.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import ComplaintsPage from "./pages/ComplaintsPage.jsx";
import ComplaintDetailsPage from "./pages/ComplaintDetailsPage.jsx";
import ComplaintForm from "./components/ComplaintForm.jsx";
import UsersPage from "./pages/UsersPage.jsx";

function App() {
  const [session, setSession] = useState(() => readSession());
  const [authNotice, setAuthNotice] = useState("");

  const [route, setRoute] = useState({ page: "dashboard" });
  const [notice, setNotice] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  const [complaints, setComplaints] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [staffList, setStaffList] = useState([]);

  const staff = session ? isStaffRole(session.role) : false;
  const menu = useMemo(() => menuForRole(session?.role || "user"), [session]);
  const staffMap = useMemo(() => buildStaffMap(staffList), [staffList]);

  const forceLogout = useCallback((message) => {
    clearSession();
    setSession(null);
    setComplaints([]);
    setHasLoaded(false);
    setStaffList([]);
    setRoute({ page: "dashboard" });
    setNotice(null);
    setAuthNotice(message || "");
  }, []);

  const notify = useCallback((type, text) => {
    setNotice({ type, text });
  }, []);

  const handleError = useCallback(
    (err) => {
      if (err && err.status === 401) {
        forceLogout("Your session has expired. Please sign in again.");
        return;
      }
      setNotice({
        type: "error",
        text: (err && err.message) || "Something went wrong. Please try again.",
      });
    },
    [forceLogout]
  );

  const reloadComplaints = useCallback(async () => {
    if (!session) return;
    try {
      const data = await api.getComplaints(session.token);
      setComplaints(data);
      setHasLoaded(true);
    } catch (err) {
      handleError(err);
    } finally {
      setListLoading(false);
    }
  }, [session, handleError]);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;

    api.getComplaints(session.token).then(
      (data) => {
        if (cancelled) return;
        setComplaints(data);
        setHasLoaded(true);
        setListLoading(false);
      },
      (err) => {
        if (cancelled) return;
        handleError(err);
        setListLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [session, handleError]);

  useEffect(() => {
    if (!session || !isStaffRole(session.role)) return undefined;
    let cancelled = false;

    api
      .listStaff(session.token)
      .then((data) => {
        if (!cancelled) setStaffList(data);
      })
      .catch(() => {
        if (!cancelled) setStaffList([]);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  function handleAuthenticated(loginData) {
    saveSession(loginData);
    setAuthNotice("");
    setComplaints([]);
    setHasLoaded(false);
    setListLoading(true);
    setRoute({ page: "dashboard" });
    setSession(readSession());
  }

  function handleLogout() {
    forceLogout("");
  }

  function go(page, extra = {}) {
    setNotice(null);
    setRoute({ page, ...extra });
  }

  function handleMenuSelect(key) {
    setNavOpen(false);
    if (key === "logout") {
      handleLogout();
      return;
    }
    go(key);
  }

  useEffect(() => {
    if (!navOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setNavOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  function openComplaint(item) {
    go("details", { complaintId: item.id });
  }

  function editComplaint(item) {
    go("edit", { complaint: item });
  }

  async function deleteComplaint(item) {
    const confirmed = window.confirm(
      `Are you sure you want to delete complaint #${item.id}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await api.deleteComplaint(session.token, item.id);
      notify("success", `Complaint #${item.id} deleted.`);
      await reloadComplaints();
      go("complaints");
    } catch (err) {
      handleError(err);
    }
  }

  async function handleFormSaved(saved) {
    await reloadComplaints();
    go("details", { complaintId: saved.id });
  }

  if (!session) {
    return (
      <AuthPages onAuthenticated={handleAuthenticated} notice={authNotice} />
    );
  }

  const meta = PAGE_META[route.page] || PAGE_META.dashboard;
  const initialLoad = listLoading && !hasLoaded;

  const restricted =
    route.page === "users"
      ? session.role !== "admin"
      : (route.page === "unassigned" || route.page === "queue") && !staff;

  function renderContent() {
    if (restricted) {
      return (
        <section className="complaints-panel">
          <div className="empty-state">
            <p className="empty-title">Access denied</p>
            <p className="empty-hint">
              Your account does not have permission to view this page.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => go("dashboard")}
            >
              Back to Dashboard
            </button>
          </div>
        </section>
      );
    }

    switch (route.page) {
      case "complaints":
      case "unassigned":
      case "queue":
        return (
          <ComplaintsPage
            key={route.page}
            mode={route.page}
            token={session.token}
            session={session}
            complaints={complaints}
            loading={initialLoad}
            staffMap={staffMap}
            onView={openComplaint}
            onEdit={editComplaint}
            onDelete={deleteComplaint}
            onNewComplaint={() => go("compose")}
            notify={notify}
            handleError={handleError}
            onComplaintsChanged={reloadComplaints}
          />
        );

      case "compose":
        return (
          <ComplaintForm
            token={session.token}
            session={session}
            staffMap={staffMap}
            onSaved={handleFormSaved}
            onCancel={() => go("complaints")}
            notify={notify}
          />
        );

      case "edit":
        return (
          <ComplaintForm
            key={route.complaint?.id}
            token={session.token}
            session={session}
            staffMap={staffMap}
            editing={route.complaint}
            onSaved={handleFormSaved}
            onCancel={() =>
              route.complaint
                ? go("details", { complaintId: route.complaint.id })
                : go("complaints")
            }
            notify={notify}
          />
        );

      case "details":
        return (
          <ComplaintDetailsPage
            key={route.complaintId}
            complaintId={route.complaintId}
            token={session.token}
            session={session}
            staffMap={staffMap}
            onBack={() => go("complaints")}
            onEdit={editComplaint}
            onDelete={deleteComplaint}
            notify={notify}
            handleError={handleError}
            onChanged={reloadComplaints}
          />
        );

      case "analytics":
        return (
          <AnalyticsPage
            session={session}
            notify={notify}
            handleError={handleError}
          />
        );

      case "users":
        return (
          <UsersPage
            token={session.token}
            session={session}
            notify={notify}
            handleError={handleError}
          />
        );

      case "dashboard":
      default:
        return (
          <Dashboard
            session={session}
            complaints={complaints}
            loading={initialLoad}
            hasLoaded={hasLoaded}
            staffMap={staffMap}
            onView={openComplaint}
            onEdit={editComplaint}
            onDelete={deleteComplaint}
            onNavigate={go}
          />
        );
    }
  }

  return (
    <div className="app">
      <Sidebar
        items={menu}
        active={route.page === "edit" ? "compose" : route.page}
        onSelect={handleMenuSelect}
        username={session.username}
        role={session.role}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <span aria-hidden="true">&#9776;</span>
          </button>

          <div className="topbar-heading">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>

          <div className="user-profile">
            <span className="avatar">
              {(session.username || "U").charAt(0).toUpperCase()}
            </span>
            <span className="user-profile-text">
              <strong>{session.username || "User"}</strong>
              <RoleBadge role={session.role} />
            </span>
          </div>
        </header>

        <Banner
          type={notice?.type || "error"}
          message={notice?.text || ""}
          onClose={() => setNotice(null)}
        />

        {renderContent()}
      </main>
    </div>
  );
}

export default App;
