import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getDashboard } from "@/lib/server/services/dashboard-service";
import type { DashboardFilters, ReceiverAcquisitionFilters } from "@/types/dashboard";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"]); if (auth.response) return auth.response;
    const params = request.nextUrl.searchParams;
    const filters = Object.fromEntries((["programScope", "studentUniversity", "college", "track", "packageLabel", "exactHours", "paymentStatus", "deliveryMode", "intake"] as Array<keyof DashboardFilters>).map(key => [key, [...new Set(params.getAll(key).map(value => value.trim()).filter(Boolean))]]));
    const receiverFilters: Partial<ReceiverAcquisitionFilters> = {
      intake: params.get("receiverIntake"),
      dateFrom: params.get("receiverDateFrom"),
      dateTo: params.get("receiverDateTo"),
      university: params.get("receiverUniversity"),
      receiver: params.get("receiver"),
    };
    return NextResponse.json({ ok: true, dashboard: await getDashboard(filters, receiverFilters) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
