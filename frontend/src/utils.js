export function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function statusLabel(value) {
  const normalized = normalizeStatus(value);
  if (!normalized) return "\u2014";
  return normalized
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function statusClass(value) {
  return normalizeStatus(value).replace(/_/g, "-") || "unknown";
}

export function formatDate(value) {
  if (!value) return "\u2014";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(value) {
  if (!value) return "\u2014";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isStaffRole(role) {
  return role === "staff" || role === "admin";
}

export function isAdminRole(role) {
  return role === "admin";
}

export function canEditComplaint(complaint, session) {
  if (!complaint || !session) return false;
  return isStaffRole(session.role) || complaint.user_id === session.userId;
}

export function canDeleteComplaint(complaint, session) {
  if (!complaint || !session) return false;
  return session.role === "admin" || complaint.user_id === session.userId;
}

export function canManageWorkflow(session) {
  return isStaffRole(session?.role);
}

export function canAssignComplaints(session) {
  return isAdminRole(session?.role);
}

export function canCreateComplaints(session) {
  const role = session?.role;
  return role === "user" || role === "admin";
}

export function staffLabel(person) {
  if (!person) return "";
  return person.full_name || person.username || `User #${person.id}`;
}

export function buildStaffMap(staffList) {
  const map = {};
  (staffList || []).forEach((person) => {
    map[person.id] = staffLabel(person);
  });
  return map;
}

export function resolveUserLabel(userId, session, staffMap) {
  if (userId == null) return "\u2014";
  if (session && userId === session.userId) return "You";
  if (staffMap && staffMap[userId]) return staffMap[userId];
  return `Staff #${userId}`;
}
