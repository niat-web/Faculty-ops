import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { makeResetToken } from "@/lib/crypto.js";
import { buildSetPasswordLink, sendSetPasswordEmail } from "@/lib/invites.js";

// Bulk "set your password" mail-out. Body: { scope: "pending" | "all", role? }.
//   pending → users who still need to set a password (default)
//   all     → everyone except Ops Admins
// Each gets a fresh 1-hour link. Email delivery is best-effort (no-op until SES
// is configured); tokens are stamped regardless so the links work.
export async function POST(req) {
  let actor;
  try { actor = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scope = body.scope === "all" ? "all" : "pending";
  const base = process.env.APP_URL || new URL(req.url).origin;

  await connectDB();
  const filter = { active: true, email: { $ne: null }, role: { $ne: "OPS_ADMIN" } };
  if (scope === "pending") filter.mustSetPassword = true;

  const users = await User.find(filter).select("email name").lean();
  if (!users.length) return NextResponse.json({ ok: true, count: 0, delivered: 0 });

  const ops = [];
  const toSend = [];
  const exp = new Date(Date.now() + 60 * 60 * 1000);
  for (const u of users) {
    const { token, hash } = makeResetToken();
    ops.push({ updateOne: { filter: { _id: u._id }, update: { $set: { resetTokenHash: hash, resetTokenExp: exp, mustSetPassword: true } } } });
    toSend.push({ user: u, link: buildSetPasswordLink(base, token, u.email) });
  }
  await User.bulkWrite(ops);

  // Send in batches so a large mail-out doesn't open hundreds of sockets at once.
  let delivered = 0;
  const BATCH = 25;
  for (let i = 0; i < toSend.length; i += BATCH) {
    const res = await Promise.allSettled(
      toSend.slice(i, i + BATCH).map(({ user, link }) => sendSetPasswordEmail(user, link))
    );
    delivered += res.filter((r) => r.status === "fulfilled" && r.value?.delivered).length;
  }
  return NextResponse.json({ ok: true, count: users.length, delivered });
}
