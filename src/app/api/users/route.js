import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireUser, hashPassword, passwordIssue } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";
import { inviteUser } from "@/lib/invites.js";
import { Role } from "@/lib/enums.js";

export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const role = String(form.get("role") || "");
  const managerId = form.get("managerId") ? String(form.get("managerId")) : null;

  if (!name || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  // Password is optional: if omitted, the account is created "pending" and the
  // user sets their own password via an emailed 1-hour link.
  if (password) {
    const pwIssue = passwordIssue(password);
    if (pwIssue) return NextResponse.json({ error: pwIssue }, { status: 400 });
  }
  if (!Object.values(Role).includes(role)) return NextResponse.json({ error: "Bad role" }, { status: 400 });
  if (role === Role.CAPABILITY_MANAGER && !managerId) return NextResponse.json({ error: "Capability Managers must report to a Senior Manager" }, { status: 400 });

  await connectDB();
  if (await User.findOne({ email })) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  // No admin-typed password → store an unusable random hash; the invite link
  // lets the user set their real one.
  const passwordHash = password
    ? await hashPassword(password)
    : bcrypt.hashSync("pending-" + crypto.randomBytes(16).toString("hex"), 10);

  const created = await User.create({
    name, email, role, passwordHash,
    mustSetPassword: !password,
    managerId: role === Role.CAPABILITY_MANAGER ? managerId : null,
  });

  await writeAudit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "USER_CREATE", fieldName: "User", newValue: `${name} (${role})`, reason: "User created",
  });

  // Auto-send the set-password link for pending accounts.
  let invite = null;
  if (!password) {
    const base = process.env.APP_URL || new URL(req.url).origin;
    try { invite = await inviteUser(created, base); } catch { invite = null; }
  }

  return NextResponse.json({ ok: true, id: String(created._id), inviteLink: invite?.link || null, emailed: invite?.delivered || false });
}
