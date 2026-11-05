import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const STUDENT_SESSION_COOKIE_NAME = "techtrek_student_session";
export const STUDENT_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;

export type StudentSessionPayload = {
  academyStudentId: string;
  studentId: string;
  issuedAt: number;
  expiresAt: number;
};

function signingKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function createStudentSessionToken(student: { academyStudentId: string; studentId: string }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: StudentSessionPayload = { ...student, issuedAt, expiresAt: issuedAt + STUDENT_SESSION_MAX_AGE_SECONDS };
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(signingKey());
}

export async function verifyStudentSessionToken(token: string | undefined): Promise<StudentSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    const candidate = payload as Partial<StudentSessionPayload>;
    if (typeof candidate.academyStudentId !== "string" || typeof candidate.studentId !== "string" || typeof candidate.issuedAt !== "number" || typeof candidate.expiresAt !== "number" || candidate.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return candidate as StudentSessionPayload;
  } catch {
    return null;
  }
}
