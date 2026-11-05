import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { mutateDeliverySetup } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = z.string().trim();
const requiredText = text.min(1, "This field is required");
const positiveHours = z.coerce.number().finite().positive("Curriculum Hours must be greater than zero");
const commonTrackFields = { name: requiredText, curriculumHours: positiveHours, isActive: z.boolean(), notes: text };
const commonLevelFields = { levelName: requiredText, curriculumHours: positiveHours, isActive: z.boolean(), notes: text };
const commonMappingFields = { offeringId: requiredText, deliveryTrackId: requiredText, isActive: z.boolean(), notes: text };

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-track"), ...commonTrackFields }),
  z.object({ action: z.literal("update-track"), id: requiredText, ...commonTrackFields }),
  z.object({ action: z.literal("create-level"), deliveryTrackId: requiredText, levelCode: z.enum(["LEVEL_1", "LEVEL_2"]), ...commonLevelFields }),
  z.object({ action: z.literal("update-level"), id: requiredText, ...commonLevelFields }),
  z.object({ action: z.literal("create-mapping"), ...commonMappingFields }),
  z.object({ action: z.literal("update-mapping"), ...commonMappingFields }),
]);

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth.response) return auth.response;
  try {
    const input = mutationSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await mutateDeliverySetup(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
