import { NextResponse } from "next/server";
import { requireUser, hashPassword, verifyPassword, passwordIssue } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";

// Update the signed-in user's own display name and (optionally) password.
export async function POST(req) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();
  const user = await User.findById(me.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  user.name = name;

  if (newPassword) {
    const issue = passwordIssue(newPassword);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    user.passwordHash = await hashPassword(newPassword);
  }

  await user.save();
  return NextResponse.json({ ok: true, passwordChanged: Boolean(newPassword) });
}
