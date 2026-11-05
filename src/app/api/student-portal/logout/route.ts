import { NextResponse } from "next/server";
import { clearStudentSessionCookie } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";

export async function POST() {
  await clearStudentSessionCookie();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
