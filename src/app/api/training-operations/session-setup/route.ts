import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { mutateSessionSetup } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requiredText = z.string().trim().min(1, "This field is required");
const date = requiredText.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").refine(value => {
  const [year, month, day] = value.split("-").map(Number); const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Use a valid date");
const time = requiredText.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time");
const status = z.enum(["PLANNED", "COMPLETED", "CANCELLED", "RESCHEDULED"]);
const common = { deliveryTrackId: requiredText, batchId: requiredText, batchLevelId: requiredText, sessionNumber: z.coerce.number().int("Session Number must be a whole number").positive("Session Number must be greater than zero"), sessionDate: date, startTime: time, endTime: time, title: requiredText, status, notes: z.string().trim(), leadAssignmentId: z.string().trim(), assistantAssignmentId: z.string().trim(), mentorAssignmentId: z.string().trim() };
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("create-session"), ...common }).strict(), z.object({ action: z.literal("update-session"), id: requiredText, ...common }).strict()]);

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR"]);
  if (auth.response) return auth.response;
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await mutateSessionSetup(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
