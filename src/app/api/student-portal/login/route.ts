import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/api";
import { authenticateStudentPortal } from "@/lib/server/student-portal/service";
import { setStudentSessionCookie } from "@/lib/server/student-portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  studentId: z.string().trim().min(1, "University Student ID is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
});

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());
    const student = await authenticateStudentPortal(input.studentId, input.phone);
    await setStudentSessionCookie(student);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
