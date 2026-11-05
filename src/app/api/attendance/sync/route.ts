import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { syncAttendanceResponses } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireRole(["ADMIN", "COORDINATOR"]);
  if (auth.response) return auth.response;
  const correlationId = crypto.randomUUID();
  try {
    return NextResponse.json({ ok: true, summary: await syncAttendanceResponses() }, { headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } });
  } catch (error) {
    console.error("attendance.sync.failed", { correlationId, role: auth.user.role, error });
    const response = apiError(error);
    response.headers.set("X-Correlation-ID", correlationId);
    return response;
  }
}
