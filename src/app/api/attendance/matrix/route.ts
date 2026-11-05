import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getAttendanceMatrixData } from "@/lib/server/services/attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    return NextResponse.json({
      ok: true,
      matrix: await getAttendanceMatrixData({
        batchId: url.searchParams.get("batchId") ?? "",
        attendanceSessionId: url.searchParams.get("attendanceSessionId") ?? "",
        university: url.searchParams.get("university") ?? "",
        studentId: url.searchParams.get("studentId") ?? "",
        groupId: url.searchParams.get("groupId") ?? "",
        attendanceStatus: url.searchParams.get("attendanceStatus") ?? "",
        validationStatus: url.searchParams.get("validationStatus") ?? "",
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
