import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { connectDB } from "./db.js";
import { User } from "@/models/index.js";

const COOKIE = "crm_session";
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-32-chars-minimum-please!"
);

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

// Returns an error string if the password is too weak, else null.
export function passwordIssue(pw) {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must include letters and numbers.";
  return null;
}
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user) {
  const token = await new SignJWT({ sub: String(user._id), role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function destroySession() {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

// --- Pending second factor (between password and TOTP) ---
const PENDING = "crm_2fa";
export async function createPending2FA(user) {
  const token = await new SignJWT({ sub: String(user._id), pending2fa: true })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret);
  cookies().set(PENDING, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
}
export async function readPending2FA() {
  const token = cookies().get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.pending2fa ? payload.sub : null;
  } catch { return null; }
}
export function clearPending2FA() {
  cookies().set(PENDING, "", { path: "/", maxAge: 0 });
}

// Plain object (not a Mongoose doc) safe to pass to client components.
// Wrapped in React cache() so the layout + page in one render share a single
// DB lookup instead of hitting Atlas twice per navigation.
export const getCurrentUser = cache(async () => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    await connectDB();
    const u = await User.findById(payload.sub).select("email name role active managerId").lean();
    if (!u || !u.active) return null;
    return {
      id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      managerId: u.managerId ? String(u.managerId) : null,
    };
  } catch {
    return null;
  }
});

export async function requireUser(allowedRoles) {
  const user = await getCurrentUser();
  if (!user) {
    const e = new Error("UNAUTHENTICATED");
    e.status = 401;
    throw e;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const e = new Error("FORBIDDEN");
    e.status = 403;
    throw e;
  }
  return user;
}
