import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeOAuthCode, hasConfiguredOAuthRefreshToken, verifyOAuthConsentClient } from "@/lib/server/google/client";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
const STATE_COOKIE = "techtrek_google_oauth_state";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function settingsRedirect(request: NextRequest, status: string) {
  const response = NextResponse.redirect(new URL(`/settings?googleOAuth=${encodeURIComponent(status)}`, request.url));
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google/oauth/callback", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]); if (auth.response) return auth.response;
  const state = request.nextUrl.searchParams.get("state") ?? ""; const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!state || !expectedState || !safeEqual(state, expectedState)) return settingsRedirect(request, "invalid-state");
  if (request.nextUrl.searchParams.get("error")) return settingsRedirect(request, "consent-denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return settingsRedirect(request, "missing-code");
  try {
    const { client, refreshTokenReceived } = await exchangeOAuthCode(code);
    await verifyOAuthConsentClient(client);
    if (!hasConfiguredOAuthRefreshToken()) return settingsRedirect(request, refreshTokenReceived ? "refresh-token-required" : "refresh-token-missing");
    return settingsRedirect(request, "connected");
  } catch { return settingsRedirect(request, "oauth-failed"); }
}
