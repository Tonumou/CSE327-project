// All calls to the FastAPI backend live in this file
import type {
  AuthResponse,
  Log,
  Slot,
  Status,
  User,
} from "./types";

export const API_URL = "http://localhost:8000";

// ---------- login token (kept in the browser so a reload stays logged in) ----------

const TOKEN_KEY = "smart-parking-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked (private window): the login just won't survive a reload
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`); // proves who is logged in
  const res = await fetch(API_URL + path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail) ? body.detail[0]?.msg : body.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getStatus = () => request<Status>("/api/status");
export const getSlots = () => request<Slot[]>("/api/slots");
export const getLogs = () => request<Log[]>("/api/logs?limit=15");

// ---------- user accounts ----------

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const registerUser = (full_name: string, email: string, password: string) =>
  request<AuthResponse>("/api/auth/register", post({ full_name, email, password }));

export const loginUser = (email: string, password: string) =>
  request<AuthResponse>("/api/auth/login", post({ email, password }));

export const getMe = () => request<User>("/api/auth/me");

export const logoutUser = () => request("/api/auth/logout", { method: "POST" });

export const updateProfile = (full_name: string) =>
  request<User>("/api/auth/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name }),
  });

export const changePassword = (current_password: string, new_password: string) =>
  request<{ message: string }>("/api/auth/password", post({ current_password, new_password }));

export const addSlot = (slot: Omit<Slot, "id" | "status" | "updated_at">) =>
  request<{ id: number }>("/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slot),
  });

export const deleteSlot = (id: number) =>
  request(`/api/slots/${id}`, { method: "DELETE" });

export const deleteAllSlots = () => request("/api/slots", { method: "DELETE" });

// what the AI found when it searched the picture for parking spaces
export interface AutoResult {
  cars: number;
  slots: number;
  free: number;
  error?: string;
}

export const autoSlots = () => request<AutoResult>("/api/slots/auto", { method: "POST" });

export const setSource = (source: string) =>
  request("/api/source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });

export const uploadSource = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<Partial<AutoResult>>("/api/source/upload", { method: "POST", body: form });
};

// "t" changes every call so the browser never shows a cached picture
export const frameUrl = (annotated: boolean) =>
  `${API_URL}/api/frame?annotated=${annotated}&t=${Date.now()}`;
