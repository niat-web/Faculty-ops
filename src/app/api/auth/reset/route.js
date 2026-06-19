import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { hashPassword, passwordIssue } from "@/lib/auth.js";
import { hashResetToken } from "@/lib/crypto.js";

// Complete a password reset using the emailed token.
export async function POST(req) {
  await connectDB();
  const form = await req.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const base = new URL(req.url).origin;

  if (!token) return NextResponse.redirect(`${base}/reset?error=invalid`, { status: 303 });
  const issue = passwordIssue(password);
  if (issue) return NextResponse.redirect(`${base}/reset?token=${token}&error=${encodeURIComponent(issue)}`, { status: 303 });

  const hash = hashResetToken(token);
  const user = await User.findOne({ resetTokenHash: hash, resetTokenExp: { $gt: new Date() } });
  if (!user) return NextResponse.redirect(`${base}/reset?error=expired`, { status: 303 });

  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = null;
  user.resetTokenExp = null;
  user.mustSetPassword = false; // they've now set their own password
  await user.save();
  return NextResponse.redirect(`${base}/login?reset=1`, { status: 303 });
}
