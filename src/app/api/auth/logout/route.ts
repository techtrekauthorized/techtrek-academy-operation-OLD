import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth/session";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

