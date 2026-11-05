import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getRecordedSessionsData, getRecordedSessionsExistingData, getRecordedSessionsFormData, saveRecordedSession } from "@/lib/server/services/recorded-sessions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  recordingId: z.string().trim().optional(),
  attendanceSessionId: z.string().trim().min(1, "Attendance Session is required"),
  recordingTitle: z.string().trim().min(1, "Recording Title is required"),
  provider: z.literal("GoogleDrive"),
  videoUrl: z.string().trim().min(1, "Video URL is required"),
  videoId: z.string().trim(),
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
    const recordedSessions = mode === "form"
      ? await getRecordedSessionsFormData()
      : mode === "existing"
        ? await getRecordedSessionsExistingData()
        : await getRecordedSessionsData();
    return NextResponse.json({ ok: true, recordedSessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const input = payloadSchema.parse(await request.json());
    return NextResponse.json({ ok: true, result: await saveRecordedSession(input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
