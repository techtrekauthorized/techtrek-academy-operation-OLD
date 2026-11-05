import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { isUserRole } from "@/lib/auth/permissions";
import type { SafeUser, SessionPayload } from "./types";

export const SESSION_COOKIE_NAME = "techtrek_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function signingKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SafeUser) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...user, issuedAt, expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS };
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(signingKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    const candidate = payload as Partial<SessionPayload>;
    if (typeof candidate.userId !== "string" || typeof candidate.username !== "string" || typeof candidate.displayName !== "string" || !isUserRole(candidate.role) || typeof candidate.issuedAt !== "number" || typeof candidate.expiresAt !== "number" || candidate.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return candidate as SessionPayload;
  } catch { return null; }
}

