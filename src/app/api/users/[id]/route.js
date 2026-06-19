import { NextResponse } from "next/server";
import { requireUser, hashPassword, passwordIssue } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User, Instructor } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";
import { Role } from "@/lib/enums.js";

// Update a user (Ops Admin). Fields: name, role, managerId, active, newPassword.
export async function PATCH(req, { params }) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, role, managerId, active, newPassword } = await req.json();
  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const isSelf = String(target._id) === me.id;

  if (typeof name === "string" && name.trim()) target.name = name.trim();

  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (e !== target.email) {
      const taken = await User.findOne({ email: e, _id: { $ne: target._id } }).select("_id").lean();
      if (taken) return NextResponse.json({ error: "That email is already in use by another user." }, { status: 409 });
      target.email = e;
    }
  }

  if (typeof active === "boolean") {
    if (isSelf && !active) return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
    target.active = active;
  }

  if (role) {
    if (!Object.values(Role).includes(role)) return NextResponse.json({ error: "Bad role" }, { status: 400 });
    if (isSelf && role !== Role.OPS_ADMIN) return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
    target.role = role;
    if (role === Role.CAPABILITY_MANAGER) {
      const mgr = managerId || (target.managerId ? String(target.managerId) : null);
      if (!mgr) return NextResponse.json({ error: "Capability Managers must report to a Senior Manager." }, { status: 400 });
      target.managerId = mgr;
    } else {
      target.managerId = null; // non-CM roles don't report to a Senior Manager
    }
  } else if (managerId !== undefined && target.role === Role.CAPABILITY_MANAGER) {
    target.managerId = managerId || null;
  }

  if (newPassword) {
    const issue = passwordIssue(newPassword);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    target.passwordHash = await hashPassword(newPassword);
    target.mustSetPassword = false; // admin set a password directly
    target.resetTokenHash = null;
    target.resetTokenExp = null;
  }

  await target.save();
  await writeAudit({
    actorId: me.id, actorName: me.name, actorRole: me.role, action: "USER_CREATE",
    fieldName: "User updated", newValue: `${target.name} (${target.role})`, reason: newPassword ? "Updated (incl. password)" : "Updated",
  });
  return NextResponse.json({ ok: true });
}

// Delete a user (Ops Admin), with guards to avoid orphaning reportees.
export async function DELETE(req, { params }) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (String(target._id) === me.id) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });

  if (target.role === Role.CAPABILITY_MANAGER) {
    const n = await Instructor.countDocuments({ currentManagerId: target._id });
    if (n > 0) return NextResponse.json({ error: `Reassign this manager's ${n} reportee(s) first (Assignments).` }, { status: 409 });
  }
  if (target.role === Role.SENIOR_MANAGER) {
    const n = await User.countDocuments({ managerId: target._id });
    if (n > 0) return NextResponse.json({ error: `Reassign the ${n} Capability Manager(s) reporting to them first.` }, { status: 409 });
  }
  if (target.role === Role.OPS_ADMIN) {
    const n = await User.countDocuments({ role: Role.OPS_ADMIN });
    if (n <= 1) return NextResponse.json({ error: "Can't delete the last Ops Admin." }, { status: 409 });
  }

  await User.deleteOne({ _id: target._id });
  await writeAudit({
    actorId: me.id, actorName: me.name, actorRole: me.role, action: "USER_CREATE",
    fieldName: "User deleted", oldValue: `${target.name} (${target.role})`, reason: "Deleted",
  });
  return NextResponse.json({ ok: true });
}
