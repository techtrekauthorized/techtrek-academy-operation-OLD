import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getAttendanceScheduleData } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["ADMIN", "COORDINATOR"]);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, schedule: await getAttendanceScheduleData(auth.user.role === "ADMIN" || auth.user.role === "COORDINATOR") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
