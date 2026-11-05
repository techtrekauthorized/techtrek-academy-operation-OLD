import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth/guards";
import { getTrainingOperations, TrainingOperationsConfigurationError } from "@/lib/server/services/training-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response;
  try { return NextResponse.json({ ok: true, operations: await getTrainingOperations(auth.user.role === "ADMIN") }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof TrainingOperationsConfigurationError) return NextResponse.json({ ok: false, code: "OPERATIONS_CONFIGURATION_ERROR", error: auth.user.role === "ADMIN" ? `${error.sheet}: ${error.issue}.` : "Training Operations is not configured correctly. Contact an administrator." }, { status: 503 });
    return apiError(error);
  }
}
