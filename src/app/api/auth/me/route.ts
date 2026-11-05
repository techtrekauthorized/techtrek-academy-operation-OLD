import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
}

