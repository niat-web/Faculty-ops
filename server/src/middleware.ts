import type { Request, Response, NextFunction } from "express";
import { User } from "./models";
import { SESSION_COOKIE, verifySession } from "./lib/auth";
import type { SessionUser } from "./lib/rbac";

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser; }
  }
}

export async function resolveUser(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  const u = await User.findById(payload.sub).lean();
  if (!u || !u.active) return null;
  return { id: String(u._id), email: u.email, name: u.name, role: u.role, managerId: u.managerId ? String(u.managerId) : null };
}

// Attach req.user if a valid session exists (does not block).
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try { const u = await resolveUser(req); if (u) req.user = u; } catch {}
  next();
}

// Require an authenticated user (optionally with one of the given roles).
export function requireUser(roles?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (roles && !roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
