import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";

// Update the signed-in user's own preferences.
export async function POST(req) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const update = {};
  if (typeof body.emailNotifications === "boolean") update.emailNotifications = body.emailNotifications;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await connectDB();
  await User.findByIdAndUpdate(me.id, { $set: update });
  return NextResponse.json({ ok: true });
}
