import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { verifyPassword, createSession, createPending2FA } from "@/lib/auth.js";
import { isLocked, recordFailure, clearAttempts } from "@/lib/throttle.js";
import { recordLogin } from "@/lib/services.js";

export async function POST(req) {
  await connectDB();
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const base = new URL(req.url).origin;
  const key = `login:${email || "anon"}`;

  if (await isLocked(key)) {
    return NextResponse.redirect(`${base}/login?error=locked`, { status: 303 });
  }

  const user = await User.findOne({ email });
  const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    await recordFailure(key);
    return NextResponse.redirect(`${base}/login?error=1`, { status: 303 });
  }

  await clearAttempts(key);

  // If 2FA is enabled, require the code before issuing a full session.
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    await createPending2FA(user);
    return NextResponse.redirect(`${base}/2fa`, { status: 303 });
  }

  await createSession(user);
  await recordLogin(user, "password", req);
  return NextResponse.redirect(`${base}/app`, { status: 303 });
}
