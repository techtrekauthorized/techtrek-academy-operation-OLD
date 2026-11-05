import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getStudentDocumentsExistingData, getStudentDocumentsFormData, getStudentDocumentsQueueData, publishSelectedStudentDocuments, publishStudentDocumentsBulk, setStudentDocumentPublishStatus, validateStudentDocumentBulk } from "@/lib/server/services/student-documents-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  action: z.enum(["validate-bulk", "publish-bulk"]),
  batchId: z.string().trim().min(1),
  documentType: z.literal("TRAINING_FORM"),
  lines: z.string(),
}).strict();

const statusSchema = z.object({
  action: z.literal("set-status"),
  studentDocumentId: z.string().trim().min(1),
  publishStatus: z.enum(["PUBLISHED", "HIDDEN", "DRAFT"]),
  isActive: z.boolean().optional(),
}).strict();

const publishSelectedSchema = z.object({
  action: z.literal("publish-selected"),
  programScope: z.string().trim().min(1),
  documents: z.array(z.object({
    enrollmentId: z.string().trim().min(1),
    driveUrl: z.string().trim().min(1),
  }).strict()).min(1),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const mode = request.nextUrl.searchParams.get("mode");
    const studentDocuments = mode === "existing"
      ? await getStudentDocumentsExistingData()
      : mode === "queue"
        ? await getStudentDocumentsQueueData(request.nextUrl.searchParams.get("programScope") ?? "")
        : await getStudentDocumentsFormData();
    return NextResponse.json({ ok: true, studentDocuments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "COORDINATOR", "MENTOR"]);
    if (auth.response) return auth.response;
    const body = await request.json();
    if (body?.action === "set-status") {
      const input = statusSchema.parse(body);
      return NextResponse.json({ ok: true, result: await setStudentDocumentPublishStatus(input, auth.user) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "publish-selected") {
      const input = publishSelectedSchema.parse(body);
      return NextResponse.json({ ok: true, result: await publishSelectedStudentDocuments(input, auth.user) }, { headers: { "Cache-Control": "no-store" } });
    }
    const input = bulkSchema.parse(body);
    const result = input.action === "publish-bulk" ? await publishStudentDocumentsBulk(input, auth.user) : await validateStudentDocumentBulk(input);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
