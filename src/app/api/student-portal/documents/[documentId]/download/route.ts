import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/services/errors";
import { downloadStudentDocumentPdf } from "@/lib/server/services/student-documents-service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireStudentSession() {
  const session = await getStudentSession();
  if (!session) throw new ServiceError("STUDENT_PORTAL_UNAUTHENTICATED", "Student portal sign-in required.", 401);
  return session;
}

export async function GET(_: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireStudentSession();
    const { documentId } = await context.params;
    const file = await downloadStudentDocumentPdf(session.academyStudentId, session.studentId, decodeURIComponent(documentId));
    return new NextResponse(file.bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
