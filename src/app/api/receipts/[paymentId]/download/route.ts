import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { downloadDriveFile } from "@/lib/server/google/drive";
import { getPayment } from "@/lib/server/services/payment-service";
import { ServiceError } from "@/lib/server/services/errors";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ paymentId: string }> }) {
  try {
    const auth = await requireRole(["SALES", "COORDINATOR", "ADMIN"]); if (auth.response) return auth.response;
    const { paymentId } = await context.params; const payment = await getPayment(paymentId);
    if (!payment.receiptPdfFileId || payment.receiptStatus !== "Generated") throw new ServiceError("RECEIPT_NOT_AVAILABLE", "Generated receipt PDF is not available", 404);
    const pdf = await downloadDriveFile(payment.receiptPdfFileId);
    const filename = `Receipt_${payment.receiptNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
