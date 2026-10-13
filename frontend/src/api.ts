// All calls to the FastAPI backend live in this file
import type { Log, Slot, Status } from "./types";

export const API_URL = "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getStatus = () => request<Status>("/api/status");
export const getSlots = () => request<Slot[]>("/api/slots");
export const getLogs = () => request<Log[]>("/api/logs?limit=15");

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
