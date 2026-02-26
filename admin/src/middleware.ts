import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "change-me-in-production-please";

function verifySessionToken(raw: string): boolean {
  const parts = raw.split(":");
  if (parts.length !== 3) return false;

  const [tsStr, expiresStr, hash] = parts;
  const ts = parseInt(tsStr, 10);
  const expires = parseInt(expiresStr, 10);

  if (isNaN(ts) || isNaN(expires)) return false;
  if (Date.now() > expires) return false;

  const payload = `${ts}:${expires}:${SESSION_SECRET}`;
  const expected = crypto.createHash("sha256").update(payload).digest("hex");

  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png")
  ) {
    return NextResponse.next();
  }

  // Check for valid session cookie
  const session = request.cookies.get("admin_session")?.value;
  if (session && verifySessionToken(session)) {
    return NextResponse.next();
  }

  // For API routes, return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // For page routes, redirect to login
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
