import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { makeResetToken } from "@/lib/crypto.js";
import { sendEmail } from "@/lib/email.js";
import { isLocked, recordFailure } from "@/lib/throttle.js";

// Request a password reset. Always responds OK (never reveals whether an
// email exists). If it does, emails a one-hour reset link.
export async function POST(req) {
  await connectDB();
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const base = process.env.APP_URL || new URL(req.url).origin;
  const origin = new URL(req.url).origin;

  // Throttle reset requests (anti-spam / anti-enumeration).
  const key = `forgot:${email || "anon"}`;
  if (email && (await isLocked(key))) {
    return NextResponse.redirect(`${origin}/forgot?sent=1`, { status: 303 });
  }
  if (email) await recordFailure(key);

  const user = email ? await User.findOne({ email }) : null;
  if (user && user.active) {
    const { token, hash } = makeResetToken();
    user.resetTokenHash = hash;
    user.resetTokenExp = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${base}/reset?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: "Reset your FacultyOps password",
      html: `<p>Hi ${user.name},</p><p>Reset your password (valid 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore this email.</p>`,
      text: `Reset your password (valid 1 hour): ${link}`,
    });
  }
  // Always redirect to the same confirmation (never reveal if the email exists).
  return NextResponse.redirect(`${new URL(req.url).origin}/forgot?sent=1`, { status: 303 });
}
