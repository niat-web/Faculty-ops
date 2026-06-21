import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import { config } from "../config";

export const SESSION_COOKIE = "crm_session";

export function hashPassword(plain: string) { return bcrypt.hash(plain, 10); }
export function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash); }

export function passwordIssue(pw: string, opts?: { minLength?: number; requireComplexity?: boolean }): string | null {
  const min = opts?.minLength ?? 8;
  const complex = opts?.requireComplexity ?? true;
  if (!pw || pw.length < min) return `Password must be at least ${min} characters.`;
  if (complex && (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))) return "Password must include letters and numbers.";
  return null;
}

export function signSession(user: { _id: any; role: string }) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: "12h" });
}
export function verifySession(token: string): { sub: string; role: string; iat?: number } | null {
  try { return jwt.verify(token, config.jwtSecret) as any; } catch { return null; }
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: (config.isProd ? "none" : "lax") as "none" | "lax",
  secure: config.isProd,
  path: "/",
});
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOpts(), maxAge: 12 * 60 * 60 * 1000 });
}
export function clearSessionCookie(res: Response) {
  res.cookie(SESSION_COOKIE, "", { ...cookieOpts(), maxAge: 0 });
}
