import "server-only";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/permissions";
import { getCurrentUser } from "./session";
import type { SafeUser } from "./types";

type GuardResult = { user: SafeUser; response?: never } | { user?: never; response: NextResponse };

export async function requireAuth(): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ ok: false, code: "UNAUTHENTICATED", error: "Authentication required" }, { status: 401 }) };
  return { user };
}

export async function requireRole(allowedRoles: readonly UserRole[]): Promise<GuardResult> {
  const result = await requireAuth();
  if (result.response) return result;
  if (!allowedRoles.includes(result.user.role)) return { response: NextResponse.json({ ok: false, code: "FORBIDDEN", error: "You do not have permission to perform this action" }, { status: 403 }) };
  return result;
}

