import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/services/errors";
import { getStudentPortalProfile } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getStudentSession();
    if (!session) throw new ServiceError("STUDENT_PORTAL_UNAUTHENTICATED", "Student portal sign-in required.", 401);
    return NextResponse.json({ ok: true, profile: await getStudentPortalProfile(session.academyStudentId, session.studentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
