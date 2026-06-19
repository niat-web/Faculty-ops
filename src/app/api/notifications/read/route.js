import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Notification } from "@/models/index.js";

export async function POST() {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  await connectDB();
  await Notification.updateMany({ userId: user.id, read: false }, { $set: { read: true } });
  return NextResponse.json({ ok: true });
}
