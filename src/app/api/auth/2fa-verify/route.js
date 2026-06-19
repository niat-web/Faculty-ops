import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { readPending2FA, clearPending2FA, createSession } from "@/lib/auth.js";
import { verifyToken } from "@/lib/totp.js";
import { maybeDecrypt } from "@/lib/crypto.js";
import { isLocked, recordFailure, clearAttempts } from "@/lib/throttle.js";
import { recordLogin } from "@/lib/services.js";

// Second step of login: verify the TOTP code against the pending user.
export async function POST(req) {
  const base = new URL(req.url).origin;
  const uid = await readPending2FA();
  if (!uid) return NextResponse.redirect(`${base}/login`, { status: 303 });

  const form = await req.formData();
  const code = String(form.get("code") || "");
  const key = `2fa:${uid}`;
  if (await isLocked(key)) return NextResponse.redirect(`${base}/2fa?error=locked`, { status: 303 });

  await connectDB();
  const user = await User.findById(uid);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    clearPending2FA();
    return NextResponse.redirect(`${base}/login`, { status: 303 });
  }

  const ok = verifyToken(maybeDecrypt(user.twoFactorSecret), code);
  if (!ok) {
    await recordFailure(key);
    return NextResponse.redirect(`${base}/2fa?error=1`, { status: 303 });
  }

  await clearAttempts(key);
  clearPending2FA();
  await createSession(user);
  await recordLogin(user, "2fa", req);
  return NextResponse.redirect(`${base}/app`, { status: 303 });
}
