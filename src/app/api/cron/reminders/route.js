import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth.js";
import { canManageUsers } from "@/lib/rbac.js";
import { runReminders } from "@/lib/reminders.js";

// Run the reminder scan. Two ways to authorize:
//  1) A scheduler (Vercel Cron / system cron) with header `x-cron-secret: $CRON_SECRET`
//     or `?secret=`. 2) A signed-in Ops Admin clicking "Run now".
async function authorize(req) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (secret && provided && provided === secret) return true;
  const user = await getCurrentUser();
  return user && canManageUsers(user);
}

export async function POST(req) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runReminders({ withinDays: 14 });
  return NextResponse.json({ ok: true, ...result });
}

// Allow GET too, so Vercel Cron (which issues GET) can trigger it.
export async function GET(req) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runReminders({ withinDays: 14 });
  return NextResponse.json({ ok: true, ...result });
}
