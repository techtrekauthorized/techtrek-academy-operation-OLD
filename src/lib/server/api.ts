import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ServiceError } from "./services/errors";

export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ ok: false, code: "VALIDATION_FAILED", error: "Validation failed", details: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
  if (error instanceof ServiceError) return NextResponse.json({ ok: false, code: error.code, error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: error.status });
  const status = typeof error === "object" && error && "code" in error ? Number((error as { code?: unknown }).code) : 0;
  if (status === 429) return NextResponse.json({ ok: false, code: "GOOGLE_SHEETS_RATE_LIMITED", error: "Google Sheets is temporarily busy. Please try again shortly." }, { status: 429 });
  if (status === 403) return NextResponse.json({ ok: false, code: "GOOGLE_PERMISSION_ERROR", error: "Google Sheets permission error" }, { status: 502 });
  return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", error: "The operation could not be completed" }, { status: 500 });
}
