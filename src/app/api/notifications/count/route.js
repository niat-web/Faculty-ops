import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Notification } from "@/models/index.js";

// Lightweight unread-count endpoint, polled by the header bell.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ unread: 0 });
  await connectDB();
  const unread = await Notification.countDocuments({ userId: user.id, read: false });
  return NextResponse.json({ unread });
}
