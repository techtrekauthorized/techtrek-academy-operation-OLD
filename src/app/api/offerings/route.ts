import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getCurrentIntake, getOfferings } from "@/lib/server/services/enrollment-service";
import { getReceiptConfiguration, receiptNumber } from "@/lib/server/services/receipt-service";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const [offerings, intake, config] = await Promise.all([getOfferings(), getCurrentIntake(), getReceiptConfiguration()]); return NextResponse.json({ ok: true, offerings, currentIntake: intake, receiptNumberPreview: receiptNumber(config.prefix, config.sequence) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
