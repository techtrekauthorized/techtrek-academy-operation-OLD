import { NextRequest, NextResponse } from "next/server";
import { canAccessRoute, getDefaultRouteForRole } from "@/lib/auth/permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth/token";
import { STUDENT_SESSION_COOKIE_NAME, verifyStudentSessionToken } from "@/lib/server/student-portal/token";

const STATIC_FILE_EXTENSION = /\.(?:png|jpe?g|webp|gif|svg|ico|avif|css|js|map|woff2?|ttf)$/i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/brand/") || pathname.startsWith("/_next/") || pathname === "/favicon.ico" || STATIC_FILE_EXTENSION.test(pathname)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/verify/certificate/")) return NextResponse.next();
  if (pathname === "/student") return NextResponse.next();
  if (pathname.startsWith("/student/")) {
    const studentSession = await verifyStudentSessionToken(request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value);
    if (studentSession) return NextResponse.next();
    return NextResponse.redirect(new URL("/student", request.url));
  }
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(new URL(getDefaultRouteForRole(session.role), request.url));
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("reason", "session-required");
    return NextResponse.redirect(login);
  }

  const target = pathname === "/" ? getDefaultRouteForRole(session.role) : pathname;
  if (pathname === "/") return NextResponse.redirect(new URL(target, request.url));
  if (pathname === "/tracks-groups/student-placement") {
    if (!canAccessRoute(session.role, "/student-placement")) {
      const fallback = new URL(getDefaultRouteForRole(session.role), request.url);
      fallback.searchParams.set("reason", "unauthorized");
      return NextResponse.redirect(fallback);
    }
    return NextResponse.redirect(new URL("/student-placement", request.url));
  }
  if (!canAccessRoute(session.role, target)) {
    const fallback = new URL(getDefaultRouteForRole(session.role), request.url);
    fallback.searchParams.set("reason", "unauthorized");
    return NextResponse.redirect(fallback);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
