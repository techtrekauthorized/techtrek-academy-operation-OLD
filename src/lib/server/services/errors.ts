export type SafeGoogleDetails = { googleStatus: number; googleReason: string; stage: string };

export class ServiceError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: SafeGoogleDetails) { super(message); }
}

type GoogleErrorShape = { code?: unknown; response?: { status?: unknown; data?: { error?: { code?: unknown; status?: unknown; errors?: Array<{ reason?: unknown }> } } } };

export function safeGoogleDetails(error: unknown, stage: string): SafeGoogleDetails {
  const value = (typeof error === "object" && error ? error : {}) as GoogleErrorShape;
  const googleStatus = Number(value.response?.data?.error?.code ?? value.response?.status ?? value.code ?? 0) || 0;
  const oauthConfigMissing = error instanceof Error && error.message.includes("GOOGLE_OAUTH_") && error.message.includes("not configured");
  const rawReason = String(value.response?.data?.error?.errors?.[0]?.reason ?? value.response?.data?.error?.status ?? (oauthConfigMissing ? "oauthEnvironmentNotConfigured" : googleStatus === 401 ? "unauthorized" : googleStatus === 403 ? "forbidden" : googleStatus === 404 ? "notFound" : "unknownGoogleError"));
  const googleReason = rawReason.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "unknownGoogleError";
  return { googleStatus, googleReason, stage };
}

export function googleWorkspaceError(error: unknown, stage: string): ServiceError {
  const details = safeGoogleDetails(error, stage);
  console.error("Google Workspace operation failed", details);
  return new ServiceError("GOOGLE_WORKSPACE_ERROR", `Google Workspace failed while ${stage} (${details.googleStatus || "unknown"}: ${details.googleReason}).`, 502, details);
}
