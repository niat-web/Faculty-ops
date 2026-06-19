import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { googleConfigured, buildAuthUrl } from "@/lib/google.js";

// Start Google sign-in: set a CSRF state cookie and redirect to Google's consent.
export async function GET(req) {
  const origin = new URL(req.url).origin;
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=google_unconfigured`, { status: 303 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("g_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 600,
  });
  return NextResponse.redirect(buildAuthUrl({ state, origin }), { status: 303 });
}
