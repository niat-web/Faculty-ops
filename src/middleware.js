import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

// Sliding session: when a valid session token is past half its lifetime, re-issue
// it so active users aren't abruptly logged out. Runs only on /app pages.
const COOKIE = "crm_session";
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-32-chars-minimum-please!"
);
const TTL_SECONDS = 60 * 60 * 12; // 12h

export async function middleware(req) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.next();

  try {
    const { payload } = await jwtVerify(token, secret);
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = payload.iat || now;
    const halfLife = TTL_SECONDS / 2;
    if (now - issuedAt < halfLife) return NextResponse.next(); // still fresh

    const fresh = await new SignJWT({ sub: payload.sub, role: payload.role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(secret);

    const res = NextResponse.next();
    res.cookies.set(COOKIE, fresh, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: TTL_SECONDS,
    });
    return res;
  } catch {
    return NextResponse.next(); // invalid/expired → let the page handle redirect
  }
}

export const config = { matcher: ["/app/:path*"] };
