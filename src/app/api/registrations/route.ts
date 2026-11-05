import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { registerStudentEnrollment } from "@/lib/server/services/registration-service";
import { registrationSchema } from "@/lib/server/validation";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const input = registrationSchema.parse(await request.json()); return NextResponse.json({ ok: true, result: await registerStudentEnrollment(input) }, { status: 201 }); } catch (error) { return apiError(error); } }
