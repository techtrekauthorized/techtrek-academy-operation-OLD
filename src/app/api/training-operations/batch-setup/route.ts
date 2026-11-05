import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { mutateBatchSetup } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = z.string().trim();
const requiredText = text.min(1, "This field is required");
const date = requiredText.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").refine(value => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Use a valid date");
const status = z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]);
const location = z.enum(["Alexandria", "Cairo"]);
const attendanceRule = z.enum(["ONLINE_ONLY", "OFFLINE_ONLY", "ONLINE_OR_OFFLINE"]);
const positive = z.coerce.number().finite().positive("Value must be greater than zero");
const nonNegative = z.coerce.number().finite().min(0, "Value cannot be negative");

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-batch"), name: requiredText, deliveryTrackId: requiredText, intake: requiredText, startDate: date, endDate: date, status, location, notes: text }),
  z.object({ action: z.literal("update-batch"), id: requiredText, name: requiredText, startDate: date, endDate: date, status, location, notes: text }),
  z.object({ action: z.literal("update-batch-level"), id: requiredText, levelName: requiredText, startDate: date, endDate: date, curriculumHours: positive, plannedLiveHours: nonNegative, projectAssignmentHours: nonNegative, sessionCount: z.coerce.number().int("Session Count must be a whole number").min(0, "Session Count cannot be negative"), attendanceRule, status, notes: text }),
]);

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth.response) return auth.response;
  try {
    const input = mutationSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await mutateBatchSetup(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
