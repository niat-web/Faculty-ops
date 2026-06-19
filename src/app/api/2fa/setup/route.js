import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { generateSecret, otpauthUrl } from "@/lib/totp.js";
import { encrypt } from "@/lib/crypto.js";

// Begin 2FA enrollment: generate a secret (stored, not yet enabled) and return
// the otpauth URI + secret for the user to add to their authenticator app.
export async function POST() {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  await connectDB();
  const user = await User.findById(me.id);
  const secret = generateSecret();
  user.twoFactorSecret = encrypt(secret); // encrypted at rest (no-op without ENCRYPTION_KEY)
  user.twoFactorEnabled = false;
  await user.save();

  return NextResponse.json({ ok: true, secret, otpauth: otpauthUrl(secret, user.email) });
}
