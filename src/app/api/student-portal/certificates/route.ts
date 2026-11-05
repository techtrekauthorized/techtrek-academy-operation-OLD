import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/services/errors";
import { getStudentPortalCertificates } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireStudentSession() {
  const session = await getStudentSession();
  if (!session) throw new ServiceError("STUDENT_PORTAL_UNAUTHENTICATED", "Student portal sign-in required.", 401);
  return session;
}

export async function GET() {
  try {
    const session = await requireStudentSession();
    return NextResponse.json({ ok: true, certificates: await getStudentPortalCertificates(session.academyStudentId, session.studentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
