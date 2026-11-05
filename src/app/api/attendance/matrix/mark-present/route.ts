import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { markAttendanceMatrixPresent } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  records: z.array(z.object({
    studentId: z.string().trim().min(1),
    attendanceSessionId: z.string().trim().min(1),
  }).strict()).min(1).max(200),
  reason: z.string().trim().max(500).optional().default(""),
}).strict();

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  const correlationId = crypto.randomUUID();
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await markAttendanceMatrixPresent(input, auth.user.displayName || auth.user.username) }, { headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } });
  } catch (error) {
    console.error("attendance.matrix.mark-present.failed", { correlationId, role: auth.user.role, error });
    const response = apiError(error);
    response.headers.set("X-Correlation-ID", correlationId);
    return response;
  }
}
