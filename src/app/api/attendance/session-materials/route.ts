import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getSessionMaterialsData, getSessionMaterialsExistingData, getSessionMaterialsFormData, saveSessionMaterial } from "@/lib/server/services/session-materials-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  materialId: z.string().trim().optional(),
  attendanceSessionId: z.string().trim().min(1, "Attendance Session is required"),
  materialTitle: z.string().trim().min(1, "Material Title is required"),
  materialType: z.enum(["PDF", "Presentation", "Doc", "Sheet", "Other"]),
  provider: z.literal("GoogleDrive"),
  fileUrl: z.string().trim().min(1, "File URL is required"),
  fileId: z.string().trim(),
  sessionNumber: z.string().trim(),
  levelCode: z.string().trim(),
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
    const sessionMaterials = mode === "form"
      ? await getSessionMaterialsFormData()
      : mode === "existing"
        ? await getSessionMaterialsExistingData()
        : await getSessionMaterialsData();
    return NextResponse.json({ ok: true, sessionMaterials }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const input = payloadSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await saveSessionMaterial(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
