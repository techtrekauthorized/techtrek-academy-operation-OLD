import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { downloadDriveFile } from "@/lib/server/google/drive";
import { ServiceError } from "@/lib/server/services/errors";
import { getStudentPortalCertificateFile } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireStudentSession() {
  const session = await getStudentSession();
  if (!session) throw new ServiceError("STUDENT_PORTAL_UNAUTHENTICATED", "Student portal sign-in required.", 401);
  return session;
}

export async function GET(_: Request, context: { params: Promise<{ certificateId: string }> }) {
  try {
    const session = await requireStudentSession();
    const { certificateId } = await context.params;
    const file = await getStudentPortalCertificateFile(session.academyStudentId, session.studentId, decodeURIComponent(certificateId));
    const pdf = await downloadDriveFile(file.fileId);
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.pdfFilename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
