import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getAttendanceData } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, attendance: await getAttendanceData() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
