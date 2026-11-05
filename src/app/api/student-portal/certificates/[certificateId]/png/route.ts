import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: false, error: "Certificate image download is available as JPG." }, { status: 410 });
}
