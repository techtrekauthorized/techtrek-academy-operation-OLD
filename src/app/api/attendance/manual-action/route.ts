import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { applyManualAttendanceAction } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manualActionSchema = z.object({
  attendanceSessionId: z.string().trim().min(1, "Attendance session is required"),
  enrollmentId: z.string().trim().optional().default(""),
  attendanceId: z.string().trim().optional().default(""),
  sourceResponseRow: z.string().trim().optional().default(""),
  resolvedAcademyStudentId: z.string().trim().optional().default(""),
  action: z.enum(["PRESENT", "EXCUSED", "NEEDS_REVIEW", "REJECT"]),
  note: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  try {
    const input = manualActionSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await applyManualAttendanceAction(input, auth.user.displayName || auth.user.username) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
