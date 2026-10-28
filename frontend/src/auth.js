const TOKEN_KEY = "access_token";
const USERNAME_KEY = "username";
const ROLE_KEY = "user_role";
const USER_ID_KEY = "user_id";

export function readSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const storedId = sessionStorage.getItem(USER_ID_KEY);

  return {
    token,
    username: sessionStorage.getItem(USERNAME_KEY) || "",
    role: sessionStorage.getItem(ROLE_KEY) || "user",
    userId: storedId ? Number(storedId) : null,
  };
}

export function saveSession(loginData) {
  sessionStorage.setItem(TOKEN_KEY, loginData.access_token);
  sessionStorage.setItem(USERNAME_KEY, loginData.username || "");
  sessionStorage.setItem(ROLE_KEY, loginData.role || "user");
  if (loginData.user_id) {
    sessionStorage.setItem(USER_ID_KEY, String(loginData.user_id));
  }
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USERNAME_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
}
