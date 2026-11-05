import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { deleteStudentCompletely, getStudentProfile, updateStudent } from "@/lib/server/services/student-service";
import { studentPatchSchema } from "@/lib/server/validation";
import { requireRole } from "@/lib/server/auth/guards";
import { verifyCurrentAdminPassword } from "@/lib/server/auth/users-service";
import { ServiceError } from "@/lib/server/services/errors";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const { id } = await context.params; return NextResponse.json({ ok: true, ...(await getStudentProfile(id)) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const { id } = await context.params; const patch = studentPatchSchema.parse(await request.json()); return NextResponse.json({ ok: true, student: await updateStudent(id, patch) }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const auth = await requireRole(["ADMIN"]); if (auth.response) return auth.response; const body = z.object({ confirmationPassword: z.string().min(1) }).strict().parse(await request.json()); if (!await verifyCurrentAdminPassword(auth.user.userId, body.confirmationPassword)) throw new ServiceError("INCORRECT_ADMIN_PASSWORD", "Incorrect administrator password.", 403); const { id } = await context.params; return NextResponse.json({ ok: true, result: await deleteStudentCompletely(id) }); } catch (error) { return apiError(error); } }
