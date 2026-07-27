import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { User } from "./models";
import { SESSION_COOKIE, verifySession } from "./lib/auth";
import { config } from "./config";
import { isRoleEnabled, ROLE_DISABLED_MSG } from "./lib/settings";
import type { SessionUser } from "./lib/rbac";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Public / machine endpoints that must not require a browser Origin header.
const CSRF_SKIP = [
  "/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/auth/google",
  "/api/cron/", "/api/certifications/config", "/api/certifications/employee-search", "/api/certifications/submit",
];

function originAllowed(url: string) {
  return config.clientUrls.some((a) => url.startsWith(a));
}

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
  // Reject sessions issued before the user's last password change (logout-on-reset). (Security)
  if (u.passwordChangedAt && payload.iat && payload.iat * 1000 < new Date(u.passwordChangedAt).getTime()) return null;
  if (u.sessionInvalidAfter && payload.iat && payload.iat * 1000 < new Date(u.sessionInvalidAfter).getTime()) return null;
  return { id: String(u._id), email: u.email, name: u.name, role: u.role, managerId: u.managerId ? String(u.managerId) : null };
}

// Attach req.user if a valid session exists (does not block).
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const u = await resolveUser(req);
    if (u) {
      req.user = u;
      const { touchLastSeen } = await import("./lib/services"); // throttled DB write → presence tracking
      touchLastSeen(u.id);
    }
  } catch (e) { console.error("[attachUser]", e); }
  next();
}

// CSRF mitigation for cookie-authenticated mutations: require Origin/Referer to match CLIENT_URL.
export function enforceMutationOrigin(req: Request, res: Response, next: NextFunction) {
  if (!MUTATION_METHODS.has(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  if (CSRF_SKIP.some((p) => path.startsWith(p))) return next();
  if (!req.cookies?.[SESSION_COOKIE]) return next(); // not a browser cookie session
  const origin = String(req.headers.origin || "");
  const referer = String(req.headers.referer || "");
  if (origin && originAllowed(origin)) return next();
  if (referer && originAllowed(referer)) return next();
  return res.status(403).json({ error: "Forbidden" });
}

// Reject malformed Mongo ObjectIds before they surface as 500 CastErrors.
export function validateObjectId(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const id = req.params[name];
      if (id != null && id !== "" && !mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    }
    next();
  };
}

// Block users whose ROLE has been disabled by an admin (Account Access setting).
// Mounted on /api: lets /auth/* through so the client can detect the block, show
// the "contact your admin" screen, and still log out. Ops Admin is never blocked.
export async function enforceRoleAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.path.startsWith("/auth/")) return next();
  if (!(await isRoleEnabled(req.user.role))) {
    return res.status(403).json({ code: "ROLE_DISABLED", error: ROLE_DISABLED_MSG });
  }
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
