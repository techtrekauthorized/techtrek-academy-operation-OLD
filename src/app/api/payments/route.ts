import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { createPayment, getPayments } from "@/lib/server/services/payment-service";
import { paymentSchema } from "@/lib/server/validation";
import { requireRole } from "@/lib/server/auth/guards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; return NextResponse.json({ ok: true, payments: await getPayments() }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { const auth = await requireRole(["COORDINATOR", "ADMIN"]); if (auth.response) return auth.response; const input = paymentSchema.parse(await request.json()); return NextResponse.json({ ok: true, payment: await createPayment(input) }, { status: 201 }); } catch (error) { return apiError(error); } }
