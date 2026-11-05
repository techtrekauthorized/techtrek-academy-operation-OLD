import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { searchStudents } from "@/lib/server/services/student-service";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; return NextResponse.json({ ok: true, students: await searchStudents(request.nextUrl.searchParams.get("q") ?? "") }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
