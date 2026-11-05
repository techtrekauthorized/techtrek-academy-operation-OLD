import "server-only";
import { cookies } from "next/headers";
import { createStudentSessionToken, STUDENT_SESSION_COOKIE_NAME, STUDENT_SESSION_MAX_AGE_SECONDS, verifyStudentSessionToken } from "./token";

export async function getStudentSession() {
  const store = await cookies();
  return verifyStudentSessionToken(store.get(STUDENT_SESSION_COOKIE_NAME)?.value);
}

export async function setStudentSessionCookie(student: { academyStudentId: string; studentId: string }) {
  const store = await cookies();
  store.set(STUDENT_SESSION_COOKIE_NAME, await createStudentSessionToken(student), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STUDENT_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearStudentSessionCookie() {
  const store = await cookies();
  store.set(STUDENT_SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
