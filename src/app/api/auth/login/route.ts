import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/server/auth/session";
import { authenticateUser } from "@/lib/server/auth/users-service";
import { apiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());
    const result = await authenticateUser(input.username, input.password);
    if (result.status === "invalid") return NextResponse.json({ ok: false, code: "INVALID_CREDENTIALS", error: "Invalid username or password." }, { status: 401 });
    if (result.status === "inactive") return NextResponse.json({ ok: false, code: "INACTIVE_ACCOUNT", error: "This account is inactive. Contact the administrator." }, { status: 403 });
    await setSessionCookie(result.user);
    return NextResponse.json({ ok: true, user: result.user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

