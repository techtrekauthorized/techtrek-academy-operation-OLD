import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getTasksGradesData, saveAssignment, saveAssignmentResults, setCertificateDecision, setCertificateDecisionsBulk } from "@/lib/server/services/tasks-grades-service";

const roles = ["ADMIN", "COORDINATOR", "MENTOR"] as const;

const assignmentSchema = z.object({
  action: z.literal("save-assignment"),
  assignmentId: z.string().optional(),
  batchId: z.string().trim().min(1),
  assignmentType: z.enum(["TASK", "PROJECT"]),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  levelCode: z.string().optional(),
  maxGrade: z.number().positive().nullable().optional(),
  requiredForCertificate: z.boolean(),
  showOnVerification: z.boolean(),
  verificationOrder: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean(),
  groupIds: z.array(z.string().trim().min(1)).min(1),
  notes: z.string().optional(),
});

const resultsSchema = z.object({
  action: z.literal("save-results"),
  assignmentId: z.string().trim().min(1),
  results: z.array(z.object({
    assignmentId: z.string().trim().min(1),
    enrollmentId: z.string().trim().min(1),
    submissionStatus: z.enum(["NOT_SUBMITTED", "SUBMITTED", "GRADED"]),
    grade: z.number().min(0).nullable().optional(),
    notes: z.string().optional(),
  })).min(1),
});

const decisionSchema = z.object({
  action: z.literal("set-certificate-decision"),
  enrollmentId: z.string().trim().min(1),
  decision: z.enum(["PENDING", "APPROVED", "NOT_APPROVED"]),
  notes: z.string().optional(),
});

const bulkDecisionSchema = z.object({
  action: z.literal("set-certificate-decisions-bulk"),
  changes: z.array(z.object({
    enrollmentId: z.string().trim().min(1),
    decision: z.enum(["PENDING", "APPROVED", "NOT_APPROVED"]),
    notes: z.string().optional(),
  })).min(1),
});

const mutationSchema = z.discriminatedUnion("action", [assignmentSchema, resultsSchema, decisionSchema, bulkDecisionSchema]);

export async function GET(request: NextRequest) {
  const auth = await requireRole(roles);
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const data = await getTasksGradesData({
      batchId: searchParams.get("batchId") ?? undefined,
      assignmentId: searchParams.get("assignmentId") ?? undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(roles);
  if (auth.response) return auth.response;
  try {
    const input = mutationSchema.parse(await request.json());
    if (input.action === "save-assignment") {
      const result = await saveAssignment(input, auth.user);
      return NextResponse.json({ ok: true, result });
    }
    if (input.action === "save-results") {
      const result = await saveAssignmentResults(input, auth.user);
      return NextResponse.json({ ok: true, result });
    }
    if (input.action === "set-certificate-decisions-bulk") {
      const result = await setCertificateDecisionsBulk(input, auth.user);
      return NextResponse.json({ ok: true, result });
    }
    const result = await setCertificateDecision(input, auth.user);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return apiError(error);
  }
}
