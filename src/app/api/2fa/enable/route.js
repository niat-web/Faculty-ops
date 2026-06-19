import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { verifyToken } from "@/lib/totp.js";
import { maybeDecrypt } from "@/lib/crypto.js";

// Confirm enrollment by verifying a code, then enable 2FA.
export async function POST(req) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const { code } = await req.json();
  await connectDB();
  const user = await User.findById(me.id);
  if (!user?.twoFactorSecret) return NextResponse.json({ error: "Start setup first." }, { status: 400 });
  if (!verifyToken(maybeDecrypt(user.twoFactorSecret), code)) {
    return NextResponse.json({ error: "Incorrect code — try again." }, { status: 400 });
  }
  user.twoFactorEnabled = true;
  await user.save();
  return NextResponse.json({ ok: true });
}
