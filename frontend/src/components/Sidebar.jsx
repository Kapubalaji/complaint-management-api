import {
  ShieldLogo,
  IconDashboard,
  IconComplaints,
  IconFilePlus,
  IconUsers,
  IconAnalytics,
  IconInbox,
  IconClock,
  IconLogOut,
} from "./Icons.jsx";

function getMenuIcon(key) {
  switch (key) {
    case "dashboard":
      return <IconDashboard size={18} />;
    case "complaints":
      return <IconComplaints size={18} />;
    case "unassigned":
      return <IconClock size={18} />;
    case "queue":
      return <IconInbox size={18} />;
    case "compose":
      return <IconFilePlus size={18} />;
    case "users":
      return <IconUsers size={18} />;
    case "analytics":
      return <IconAnalytics size={18} />;
    case "logout":
      return <IconLogOut size={18} />;
    default:
      return null;
  }
}

export default function Sidebar({
  items,
  active,
  onSelect,
  username,
  role,
  open = false,
  onClose,
}) {
  return (
    <>
      {open && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-head">
          <div className="logo-container">
            <ShieldLogo size={32} />
            <h2 className="logo">ResolveIT CMS</h2>
          </div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <p className="menu-label">WORKSPACE</p>

        <nav aria-label="Main navigation">
          {items.map((item) => {
            const isLogout = item.key === "logout";
            const isActive = !isLogout && active === item.key;
            const iconElement = getMenuIcon(item.key);

            return (
              <button
                key={item.key}
                type="button"
                data-icon={item.icon}
                data-testid={`menu-${item.key}`}
                className={
                  isLogout
                    ? "menu-item logout-button"
                    : isActive
                      ? "menu-item active"
                      : "menu-item"
                }
                onClick={() => onSelect(item.key)}
              >
                {iconElement && <span className="menu-icon-wrap" aria-hidden="true">{iconElement}</span>}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <span className="sidebar-avatar">
            {(username || "U").charAt(0).toUpperCase()}
          </span>
          <span className="sidebar-user-text">
            <strong>{username || "User"}</strong>
            <small>{role}</small>
          </span>
        </div>

        <div className="sidebar-footer">Complaint Management</div>
      </aside>
    </>
  );
}
