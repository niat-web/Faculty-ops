import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";

// Save or delete a personal instructor-list filter view.
export async function POST(req) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const { op, name, query, id } = await req.json();
  await connectDB();
  const user = await User.findById(me.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (op === "delete") {
    user.savedViews = user.savedViews.filter((v) => String(v._id) !== String(id));
  } else {
    const clean = String(name || "").trim();
    if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (user.savedViews.length >= 20) return NextResponse.json({ error: "Too many saved views" }, { status: 400 });
    user.savedViews.push({ name: clean, query: String(query || "") });
  }
  await user.save();
  return NextResponse.json({ ok: true });
}
