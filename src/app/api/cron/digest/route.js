import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth.js";
import { canManageUsers } from "@/lib/rbac.js";
import { runDigest } from "@/lib/reminders.js";

async function authorize(req) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (secret && provided && provided === secret) return true;
  const user = await getCurrentUser();
  return user && canManageUsers(user);
}

export async function GET(req) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runDigest()) });
}
export async function POST(req) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runDigest()) });
}
