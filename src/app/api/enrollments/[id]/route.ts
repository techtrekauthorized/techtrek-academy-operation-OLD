import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getEnrollment, updateEnrollmentStatus } from "@/lib/server/services/enrollment-service";
import { enrollmentStatusSchema } from "@/lib/server/validation";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const { id } = await context.params; return NextResponse.json({ ok: true, enrollment: (await getEnrollment(id)).enrollment }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const { id } = await context.params; const body = enrollmentStatusSchema.parse(await request.json()); return NextResponse.json({ ok: true, enrollment: await updateEnrollmentStatus(id, body.enrollmentStatus) }); } catch (error) { return apiError(error); } }
