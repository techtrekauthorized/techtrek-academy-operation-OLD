import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/services/errors";
import { confirmStudentCertificateProfile, getStudentCertificateProfile } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const certificateProfileSchema = z.object({
  certificateName: z.string(),
  certificateEmail: z.string(),
});

async function requireStudentSession() {
  const session = await getStudentSession();
  if (!session) throw new ServiceError("STUDENT_PORTAL_UNAUTHENTICATED", "Student portal sign-in required.", 401);
  return session;
}

export async function GET() {
  try {
    const session = await requireStudentSession();
    return NextResponse.json({ ok: true, profile: await getStudentCertificateProfile(session.academyStudentId, session.studentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStudentSession();
    const input = certificateProfileSchema.parse(await request.json());
    const profile = await confirmStudentCertificateProfile(input, session.academyStudentId, session.studentId);
    return NextResponse.json({ ok: true, profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
