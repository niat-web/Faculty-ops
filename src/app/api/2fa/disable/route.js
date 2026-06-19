import { NextResponse } from "next/server";
import { requireUser, verifyPassword } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";

// Disable 2FA — requires the account password as confirmation.
export async function POST(req) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const { password } = await req.json();
  await connectDB();
  const user = await User.findById(me.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await verifyPassword(String(password || ""), user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
  }
  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  await user.save();
  return NextResponse.json({ ok: true });
}
