import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { placeStudentEnrollment } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const placementSchema = z.object({
  enrollmentId: z.string().trim().min(1, "Enrollment is required"),
  levelSelection: z.enum(["BOTH_LEVELS", "LEVEL_1", "LEVEL_2"]),
  groupId: z.string().trim().min(1, "Group is required"),
}).strict();

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR"]);
  if (auth.response) return auth.response;
  try {
    const input = placementSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await placeStudentEnrollment(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
