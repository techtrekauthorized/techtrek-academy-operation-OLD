import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { changeEnrollmentTrack } from "@/lib/server/services/enrollment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const changeTrackSchema = z.object({
  offeringId: z.string().trim().min(1, "Select a new offering"),
  deliveryMode: z.enum(["ONLINE", "OFFLINE", "HYBRID", "UNASSIGNED"]),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response;
    const { id } = await context.params; const input = changeTrackSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await changeEnrollmentTrack(id, input.offeringId, input.deliveryMode) });
  } catch (error) { return apiError(error); }
}
