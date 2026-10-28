const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  console.warn(
    "VITE_API_BASE_URL is not set for this production build; requests will target http://localhost:8000."
  );
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, value);
    }
  });
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function extractDetail(data, status) {
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => item.msg || JSON.stringify(item))
      .join(" ");
  }
  return `Request failed with status ${status}.`;
}

async function request(path, { method = "GET", body, token, query } = {}) {
  const url = `${API_BASE_URL}${path}${buildQuery(query)}`;

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Unable to reach the server. Please check your connection and try again.",
      0
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(extractDetail(data, response.status), response.status);
  }

  return data;
}

/* ----------------------------------
   Authentication and accounts
---------------------------------- */

export function registerUser(username, password, extra = {}) {
  return request("/users/register", {
    method: "POST",
    body: { username, password, ...extra },
  });
}

export function loginUser(username, password) {
  return request("/users/login", {
    method: "POST",
    body: { username, password },
  });
}

export function forgotPassword(username, email) {
  return request("/users/forgot-password", {
    method: "POST",
    body: { username, email: email || undefined },
  });
}

export function resetPassword(token, newPassword) {
  return request("/users/reset-password", {
    method: "POST",
    body: { token, newPassword },
  });
}

export function getProfile(token) {
  return request("/users/me", { token });
}

export function updateProfile(token, changes) {
  return request("/users/me", { method: "PATCH", token, body: changes });
}

export function listStaff(token) {
  return request("/users/staff", { token });
}

/* ----------------------------------
   Admin user management
---------------------------------- */

export function adminListUsers(token, query = {}) {
  return request("/users", { token, query });
}

export function adminUpdateUser(token, userId, changes) {
  return request(`/users/${userId}`, {
    method: "PATCH",
    token,
    body: changes,
  });
}

export function adminUpdateRole(token, userId, role) {
  return request(`/users/${userId}/role`, {
    method: "PATCH",
    token,
    body: { role },
  });
}

export function adminDeleteUser(token, userId) {
  return request(`/users/${userId}`, { method: "DELETE", token });
}

/* ----------------------------------
   Complaints
---------------------------------- */

export function getComplaints(token) {
  return request("/complaints", { token });
}

export function getAssignedToMe(token) {
  return request("/complaints/assigned-to-me", { token });
}

export function getUnassigned(token) {
  return request("/complaints/unassigned", { token });
}

export function getComplaint(token, complaintId) {
  return request(`/complaints/${complaintId}`, { token });
}

export function createComplaint(token, payload) {
  return request("/complaints", { method: "POST", token, body: payload });
}

export function patchComplaint(token, complaintId, changes) {
  return request(`/complaints/${complaintId}`, {
    method: "PATCH",
    token,
    body: changes,
  });
}

export function deleteComplaint(token, complaintId) {
  return request(`/complaints/${complaintId}`, { method: "DELETE", token });
}

export function updateComplaintStatus(token, complaintId, payload) {
  return request(`/complaints/${complaintId}/status`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function assignComplaint(token, complaintId, assignedStaffId) {
  return request(`/complaints/${complaintId}/assign`, {
    method: "PATCH",
    token,
    body: { assigned_staff_id: assignedStaffId },
  });
}

/* ----------------------------------
   Complaint comments
---------------------------------- */

export function getComments(token, complaintId) {
  return request(`/complaints/${complaintId}/comments`, { token });
}

export function addComment(token, complaintId, payload) {
  return request(`/complaints/${complaintId}/comments`, {
    method: "POST",
    token,
    body: payload,
  });
}

/* ----------------------------------
   AI intelligence
---------------------------------- */

export function previewAi(token, title, description) {
  return request("/ai/preview", {
    method: "POST",
    token,
    query: { title, description },
  });
}

export function reanalyzeComplaint(token, complaintId) {
  return request(`/complaints/${complaintId}/reanalyze`, {
    method: "POST",
    token,
  });
}

/* ----------------------------------
   Analytics and reports
---------------------------------- */

export function getAnalytics(token) {
  return request("/reports/analytics", { token });
}

export async function downloadReportCsv(token, range = {}) {
  const query = buildQuery({
    start_date: range.startDate,
    end_date: range.endDate,
  });
  const url = `${API_BASE_URL}/reports/export${query}`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(
      "Unable to reach the server. Please check your connection and try again.",
      0
    );
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(extractDetail(data, response.status), response.status);
  }

  return response.text();
}
