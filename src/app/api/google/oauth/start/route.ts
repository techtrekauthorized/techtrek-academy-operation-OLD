import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getOAuthAuthorizationUrl } from "@/lib/server/google/client";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
const STATE_COOKIE = "techtrek_google_oauth_state";

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]); if (auth.response) return auth.response;
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(getOAuthAuthorizationUrl(state));
    response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google/oauth/callback", maxAge: 600 });
    return response;
  } catch (error) { return apiError(error); }
}
