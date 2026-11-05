import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getLearningResourcesData, getLearningResourcesExistingData, getLearningResourcesFormData, saveLearningResource } from "@/lib/server/services/learning-resources-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  resourceId: z.string().trim().optional(),
  batchId: z.string().trim().min(1, "Batch is required"),
  relatedAttendanceSessionId: z.string().trim(),
  resourceTitle: z.string().trim().min(1, "Resource Title is required"),
  resourceDescription: z.string().trim(),
  resourceType: z.literal("VIDEO"),
  resourceCategory: z.enum(["Revision", "Tutorial", "Reference", "Project Support", "Career", "Extra Practice", "Other"]),
  provider: z.literal("GoogleDrive"),
  videoUrl: z.string().trim().min(1, "Video URL is required"),
  videoId: z.string().trim(),
  publishStatus: z.enum(["Draft", "Published", "Hidden"]),
  availableFrom: z.string().trim(),
  availableTo: z.string().trim(),
  isActive: z.boolean(),
  notes: z.string().trim(),
  groupIds: z.array(z.string().trim()).default([]),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const mode = request.nextUrl.searchParams.get("mode");
    const learningResources = mode === "form"
      ? await getLearningResourcesFormData()
      : mode === "existing"
        ? await getLearningResourcesExistingData()
        : await getLearningResourcesData();
    return NextResponse.json({ ok: true, learningResources }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const input = payloadSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await saveLearningResource(input, auth.user) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
