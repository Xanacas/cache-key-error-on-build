import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "change-me-in-production-please";

/**
 * Generate a signed session token: hex(sha256(timestamp + ":" + secret))
 * The token encodes the creation time so we can expire it.
 */
function generateSessionToken(): { token: string; expires: number } {
  const now = Date.now();
  const expires = now + 24 * 60 * 60 * 1000; // 24 hours
  const payload = `${now}:${expires}:${SESSION_SECRET}`;
  const token = crypto.createHash("sha256").update(payload).digest("hex");
  return { token: `${now}:${expires}:${token}`, expires };
}

export function verifySessionToken(raw: string): boolean {
  const parts = raw.split(":");
  if (parts.length !== 3) return false;

  const [tsStr, expiresStr, hash] = parts;
  const ts = parseInt(tsStr, 10);
  const expires = parseInt(expiresStr, 10);

  if (isNaN(ts) || isNaN(expires)) return false;
  if (Date.now() > expires) return false;

  const payload = `${ts}:${expires}:${SESSION_SECRET}`;
  const expected = crypto.createHash("sha256").update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 },
      );
    }

    const { token, expires } = generateSessionToken();

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(expires),
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }
}
