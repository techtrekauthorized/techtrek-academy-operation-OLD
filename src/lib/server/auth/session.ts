import "server-only";
import { cookies } from "next/headers";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "./token";
import type { SafeUser } from "./types";

export async function getCurrentUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const payload = await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;
  return { userId: payload.userId, username: payload.username, displayName: payload.displayName, role: payload.role };
}

export async function setSessionCookie(user: SafeUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

