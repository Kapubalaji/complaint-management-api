export const CATEGORIES = [
  "IT & Systems",
  "Facilities & Maintenance",
  "Billing & Finance",
  "Human Resources",
  "Academic & Training",
  "General",
];

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export const SENTIMENTS = ["Escalated", "Frustrated", "Neutral", "Positive"];

export const STATUSES = ["open", "in_progress", "resolved", "closed"];

export const ROLES = ["user", "staff", "admin"];

export const STATUS_FILTERS = ["All", "Open", "In Progress", "Resolved", "Closed"];

export function menuForRole(role) {
  const dashboard = { key: "dashboard", label: "Dashboard", icon: "\u25A6" };
  const analytics = { key: "analytics", label: "Analytics", icon: "\u25AD" };

  if (role === "admin") {
    return [
      dashboard,
      analytics,
      { key: "complaints", label: "All Complaints", icon: "\u25A4" },
      { key: "unassigned", label: "Unassigned", icon: "\u25CB" },
      { key: "queue", label: "My Queue", icon: "\u25D0" },
      { key: "compose", label: "New Complaint", icon: "+" },
      { key: "users", label: "User Management", icon: "\u2630" },
      { key: "logout", label: "Log out", icon: "\u21AA" },
    ];
  }

  if (role === "staff") {
    return [
      dashboard,
      analytics,
      { key: "complaints", label: "All Complaints", icon: "\u25A4" },
      { key: "unassigned", label: "Unassigned", icon: "\u25CB" },
      { key: "queue", label: "My Queue", icon: "\u25D0" },
      { key: "compose", label: "New Complaint", icon: "+" },
      { key: "logout", label: "Log out", icon: "\u21AA" },
    ];
  }

  return [
    dashboard,
    analytics,
    { key: "complaints", label: "My Complaints", icon: "\u25A4" },
    { key: "compose", label: "New Complaint", icon: "+" },
    { key: "logout", label: "Log out", icon: "\u21AA" },
  ];
}

export const PAGE_META = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Manage and track your service requests.",
  },
  analytics: {
    title: "Analytics & Reports",
    subtitle: "Status, category, priority, trends, and workload from live data.",
  },
  complaints: {
    title: "Complaints",
    subtitle: "Search, filter, and review complaint records.",
  },
  unassigned: {
    title: "Unassigned Queue",
    subtitle: "Complaints waiting for an owner.",
  },
  queue: {
    title: "My Queue",
    subtitle: "Complaints currently assigned to you.",
  },
  compose: {
    title: "New Complaint",
    subtitle: "Describe the issue you need resolved.",
  },
  edit: {
    title: "Edit Complaint",
    subtitle: "Update the details of this complaint.",
  },
  details: {
    title: "Complaint Details",
    subtitle: "Full record, AI insights, and activity.",
  },
  users: {
    title: "User Management",
    subtitle: "Manage accounts, roles, and access.",
  },
};
