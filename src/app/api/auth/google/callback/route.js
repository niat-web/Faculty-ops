import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { createSession } from "@/lib/auth.js";
import { googleConfigured, exchangeCode, fetchUserInfo } from "@/lib/google.js";
import { recordLogin } from "@/lib/services.js";

// Google redirects back here with ?code & ?state.
export async function GET(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const fail = (e) => NextResponse.redirect(`${origin}/login?error=${e}`, { status: 303 });

  if (!googleConfigured()) return fail("google_unconfigured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = cookies().get("g_oauth_state")?.value;
  cookies().set("g_oauth_state", "", { path: "/", maxAge: 0 }); // one-time use

  if (url.searchParams.get("error")) return fail("google_failed");
  if (!code || !state || !saved || state !== saved) return fail("google_failed");

  let email, info;
  try {
    const tokens = await exchangeCode({ code, origin });
    info = await fetchUserInfo(tokens.access_token);
    email = String(info.email || "").toLowerCase();
  } catch {
    return fail("google_failed");
  }
  if (!email || info.verified_email === false) return fail("google_failed");

  // Access is admin-managed: only sign in if a matching, active user exists.
  await connectDB();
  const user = await User.findOne({ email });
  if (!user || !user.active) return fail("google_noaccount");

  await createSession(user);
  await recordLogin(user, "google", req);
  return NextResponse.redirect(`${origin}/app`, { status: 303 });
}
