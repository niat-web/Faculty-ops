import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth.js";

export async function POST(req) {
  destroySession();
  return NextResponse.redirect(`${new URL(req.url).origin}/login`, { status: 303 });
}
