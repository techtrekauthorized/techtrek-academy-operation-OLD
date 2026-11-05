import { safeDisplayText } from "@/lib/display";

export type ClientApiDetails = Array<{ field: string; message: string }> | { stage?: string; googleStatus?: number; googleReason?: string };
export class ClientApiError extends Error { constructor(message: string, public code = "REQUEST_FAILED", public details?: ClientApiDetails) { super(message); } }
export function formatClientApiError(error: unknown) { if (!(error instanceof ClientApiError)) return error instanceof Error ? safeDisplayText(error.message) : "Request failed"; if (Array.isArray(error.details)) return error.details.map(item => safeDisplayText(item.message)).join(" | ") || safeDisplayText(error.message); return safeDisplayText(error.message); }
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && typeof window !== "undefined") window.location.replace("/login?reason=session-expired");
  if (!response.ok) throw new ClientApiError(data.error || "Request failed", data.code, data.details);
  return data as T;
}
