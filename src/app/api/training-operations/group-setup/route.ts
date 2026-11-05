import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { mutateGroupSetup } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = z.string().trim();
const requiredText = text.min(1, "This field is required");
const levelSelection = z.enum(["BOTH_LEVELS", "LEVEL_1", "LEVEL_2"]);
const attendanceMode = z.enum(["ONLINE", "OFFLINE", ""]);
const status = z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CLOSED", "CANCELLED"]);
const capacity = z.preprocess(value => value === "" || value === null || value === undefined ? null : value, z.coerce.number().int("Capacity must be a whole number").positive("Capacity must be greater than zero").nullable());
const common = { name: requiredText, batchId: requiredText, levelSelection, level1AttendanceMode: attendanceMode, level2AttendanceMode: attendanceMode, capacity, status, notes: text };
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-group"), ...common }).strict(),
  z.object({ action: z.literal("update-group"), id: requiredText, ...common }).strict(),
]);

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN", "COORDINATOR"]);
  if (auth.response) return auth.response;
  try {
    const input = mutationSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await mutateGroupSetup(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
