import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { mutateStaffSetup } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = z.string().trim(); const requiredText = text.min(1, "This field is required");
const email = z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]);
const optionalAmount = z.preprocess(value => value === "" || value === null || value === undefined ? null : value, z.coerce.number().finite().positive("Amount must be greater than zero").nullable());
const staffFields = { name: requiredText, phone: text, email, isActive: z.boolean(), notes: text };
const assignmentFields = { batchId: requiredText, batchLevelId: text, staffId: requiredText, role: z.enum(["INSTRUCTOR", "MENTOR", "ASSISTANT"]), payBasis: z.enum(["HOURLY", "FIXED_TOTAL"]), hourlyRate: optionalAmount, fixedTotal: optionalAmount, isActive: z.boolean(), notes: text };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-staff"), ...staffFields }).strict(),
  z.object({ action: z.literal("update-staff"), id: requiredText, ...staffFields }).strict(),
  z.object({ action: z.literal("create-assignment"), ...assignmentFields }).strict(),
  z.object({ action: z.literal("update-assignment"), id: requiredText, ...assignmentFields }).strict(),
]);

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth.response) return auth.response;
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await mutateStaffSetup(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
