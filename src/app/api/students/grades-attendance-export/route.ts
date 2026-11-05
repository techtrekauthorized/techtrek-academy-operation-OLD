import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { buildGradesAttendanceExport } from "@/lib/server/services/student-grades-attendance-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exportSchema = z.object({
  enrollmentIds: z.array(z.string().trim().min(1)).min(1).max(1000),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]);
    if (auth.response) return auth.response;
    const body = exportSchema.parse(await request.json());
    const result = await buildGradesAttendanceExport(body.enrollmentIds);
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
