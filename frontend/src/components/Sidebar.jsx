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
          <h2 className="logo">ResolveIT</h2>
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
