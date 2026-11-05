import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getGroupRosters, updateEnrollmentWhatsAppStatus } from "@/lib/server/services/group-rosters-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  enrollmentId: z.string().trim().min(1, "Enrollment is required"),
  groupId: z.string().trim().min(1, "Group is required"),
  entered: z.boolean(),
}).strict();

export async function GET() {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, rosters: await getGroupRosters() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
  if (auth.response) return auth.response;
  try {
    const input = updateSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await updateEnrollmentWhatsAppStatus(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
