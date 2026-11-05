import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getPayment } from "@/lib/server/services/payment-service";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_: NextRequest, context: { params: Promise<{ paymentId: string }> }) { try { const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const { paymentId } = await context.params; const payment = await getPayment(paymentId); return NextResponse.json({ ok: true, receipt: { paymentId: payment.paymentId, receiptNumber: payment.receiptNumber, receiptStatus: payment.receiptStatus, receiptSource: payment.receiptSource, receiptLink: payment.receiptLink, receiptPdfFileId: payment.receiptPdfFileId } }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
