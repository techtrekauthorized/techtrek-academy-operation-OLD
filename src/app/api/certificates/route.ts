import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { assignRoadmapToGroup, getCertificatesData, issueCertificate, issueCertificatesBulk, publishCertificatesBulk, revokeCertificate, saveRoadmap, saveRoadmapItem, unpublishCertificate } from "@/lib/server/services/certificates-service";

const roles = ["ADMIN", "COORDINATOR", "MENTOR"] as const;

const roadmapSchema = z.object({
  action: z.literal("save-roadmap"),
  roadmapId: z.string().optional(),
  trackId: z.string().optional().default(""),
  creditHours: z.number().min(0).default(0),
  roadmapName: z.string().trim().min(1),
  version: z.string().optional(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const itemSchema = z.object({
  action: z.literal("save-roadmap-item"),
  roadmapItemId: z.string().optional(),
  roadmapId: z.string().trim().min(1),
  sectionName: z.string().trim().min(1),
  topicTitle: z.string().trim().min(1),
  sortOrder: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const assignSchema = z.object({
  action: z.literal("assign-roadmap"),
  batchId: z.string().trim().min(1),
  groupId: z.string().trim().min(1).optional(),
  groupIds: z.array(z.string().trim().min(1)).optional(),
  roadmapId: z.string().trim().min(1),
  notes: z.string().optional(),
});

const issueSchema = z.object({
  action: z.literal("issue-certificate"),
  enrollmentId: z.string().trim().min(1),
});

const issueBulkSchema = z.object({
  action: z.literal("issue-certificates-bulk"),
  enrollmentIds: z.array(z.string().trim().min(1)).min(1).max(200),
});

const revokeSchema = z.object({
  action: z.literal("revoke-certificate"),
  certificateId: z.string().trim().min(1),
});

const publishBulkSchema = z.object({
  action: z.literal("publish-certificates-bulk"),
  certificates: z.array(z.object({ certificateId: z.string().trim().min(1), driveUrl: z.string().optional() })).min(1).max(200),
});

const unpublishSchema = z.object({
  action: z.literal("unpublish-certificate"),
  certificateId: z.string().trim().min(1),
});

const mutationSchema = z.discriminatedUnion("action", [roadmapSchema, itemSchema, assignSchema, issueSchema, issueBulkSchema, revokeSchema, publishBulkSchema, unpublishSchema]);

export async function GET(request: NextRequest) {
  const auth = await requireRole(roles);
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const data = await getCertificatesData({
      batchId: searchParams.get("batchId") ?? undefined,
      groupId: searchParams.get("groupId") ?? undefined,
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
    if (input.action === "save-roadmap") return NextResponse.json({ ok: true, result: await saveRoadmap(input, auth.user) });
    if (input.action === "save-roadmap-item") return NextResponse.json({ ok: true, result: await saveRoadmapItem(input) });
    if (input.action === "assign-roadmap") return NextResponse.json({ ok: true, result: await assignRoadmapToGroup(input, auth.user) });
    if (input.action === "issue-certificate") return NextResponse.json({ ok: true, result: await issueCertificate(input, auth.user) });
    if (input.action === "issue-certificates-bulk") return NextResponse.json({ ok: true, result: await issueCertificatesBulk(input, auth.user) });
    if (input.action === "publish-certificates-bulk") return NextResponse.json({ ok: true, result: await publishCertificatesBulk(input, auth.user) });
    if (input.action === "unpublish-certificate") return NextResponse.json({ ok: true, result: await unpublishCertificate(input, auth.user) });
    return NextResponse.json({ ok: true, result: await revokeCertificate(input, auth.user) });
  } catch (error) {
    return apiError(error);
  }
}
