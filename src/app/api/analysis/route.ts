import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getAnalysisData } from "@/lib/server/services/analysis-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, analysis: await getAnalysisData() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
