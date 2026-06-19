import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { inviteUser } from "@/lib/invites.js";

// Send (or re-send) a one-hour "set your password" link to a single user.
// Returns the link too, so the admin can copy/share it when email isn't
// configured (SES) — useful before go-live.
export async function POST(req, { params }) {
  let actor;
  try { actor = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const user = await User.findById(params.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.email) return NextResponse.json({ error: "User has no email address" }, { status: 400 });

  const base = process.env.APP_URL || new URL(req.url).origin;
  const { link, delivered } = await inviteUser(user, base);
  return NextResponse.json({ ok: true, link, delivered, email: user.email });
}
