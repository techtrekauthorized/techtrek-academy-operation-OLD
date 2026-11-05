import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getActiveStudentUniversities } from "@/lib/server/services/university-service";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; return NextResponse.json({ ok: true, universities: await getActiveStudentUniversities() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
