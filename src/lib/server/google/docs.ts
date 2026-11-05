import "server-only";
import { getDriveDocsClients } from "./client";

type ReplacementContext = { paymentId?: string; receiptNumber?: string };
type GoogleErrorShape = { code?: unknown; message?: unknown; response?: { status?: unknown; data?: { error?: { code?: unknown; status?: unknown; message?: unknown; errors?: Array<{ reason?: unknown }> } } } };

export async function confirmDocument(documentId: string) {
  const { docs } = getDriveDocsClients();
  await docs.documents.get({ documentId, fields: "documentId,title" });
}

export async function replaceDocumentPlaceholders(documentId: string, values: Record<string, unknown>, context: ReplacementContext = {}) {
  const { docs } = getDriveDocsClients();
  const replacements = Object.entries(values).flatMap(([key, value]) => {
    const placeholderKey = key.trim(); const replacement = safeReplacement(value);
    return placeholderKey && replacement !== null ? [{ placeholderKey, replacement }] : [];
  });

  for (const { placeholderKey, replacement } of replacements) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await docs.documents.batchUpdate({ documentId, requestBody: { requests: [{ replaceAllText: { containsText: { text: `{{${placeholderKey}}}`, matchCase: true }, replaceText: replacement } }] } });
        break;
      } catch (error) {
        const details = safeDocsError(error);
        console.error("Google Docs placeholder replacement failed", { paymentId: context.paymentId || "unknown", receiptNumber: context.receiptNumber || "unknown", documentId, placeholderKey, attempt: attempt + 1, googleStatus: details.status, googleReason: details.reason, googleMessage: details.message });
        if (!isTransient(details.status, details.reason) || attempt === 2) throw error;
        await delay(150 * 2 ** attempt);
      }
    }
  }
}

export async function assertDocumentPlaceholderResolved(documentId: string, placeholder: string) {
  const { docs } = getDriveDocsClients();
  const response = await docs.documents.get({ documentId });
  if (JSON.stringify(response.data.body ?? {}).includes(placeholder)) throw new Error(`Receipt template placeholder ${placeholder} was not resolved`);
}

function safeReplacement(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  return null;
}

function safeDocsError(error: unknown) {
  const value = (typeof error === "object" && error ? error : {}) as GoogleErrorShape;
  const status = Number(value.response?.data?.error?.code ?? value.response?.status ?? value.code ?? 0) || 0;
  const rawReason = String(value.response?.data?.error?.errors?.[0]?.reason ?? value.response?.data?.error?.status ?? (status >= 500 || status === 0 ? "unknownGoogleError" : status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "invalidRequest"));
  const reason = rawReason.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "unknownGoogleError";
  const rawMessage = String(value.response?.data?.error?.message ?? value.message ?? "Google Docs request failed");
  const message = rawMessage.replace(/[\r\n]+/g, " ").slice(0, 240);
  return { status, reason, message };
}

function isTransient(status: number, reason: string) {
  if ([400, 401, 403, 404].includes(status)) return false;
  return status >= 500 || reason === "unknownGoogleError";
}

function delay(milliseconds: number) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
