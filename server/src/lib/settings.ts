// Admin-configurable system settings (single "global" AppSetting document).
// Cached in-process and invalidated on write so per-request reads are cheap.
import { AppSetting } from "../models";

const KEY = "global";
export const ROLE_DISABLED_MSG = "Access for your role has been disabled by an administrator. Please contact your admin.";
export const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"] as const;
export type AppRole = (typeof ROLES)[number];

let cache: any = null;

export async function getSettings() {
  if (cache) return cache;
  let doc = await AppSetting.findOne({ key: KEY });
  if (!doc) doc = await AppSetting.create({ key: KEY });
  cache = doc.toObject();
  return cache;
}

export function invalidateSettingsCache() { cache = null; }

// Normalised role-access map (defaults every role to enabled if unset).
export async function getRoleAccess(): Promise<Record<string, boolean>> {
  const s = await getSettings();
  const ra = s.roleAccess || {};
  return Object.fromEntries(ROLES.map((r) => [r, ra[r] !== false]));
}

export async function isRoleEnabled(role: string): Promise<boolean> {
  if (role === "OPS_ADMIN") return true; // Ops Admin can never be locked out (prevents total lockout).
  const ra = await getRoleAccess();
  return ra[role] !== false;
}

export async function setRoleAccess(role: AppRole, enabled: boolean) {
  const doc = await AppSetting.findOneAndUpdate(
    { key: KEY },
    { $set: { [`roleAccess.${role}`]: enabled } },
    { new: true, upsert: true }
  );
  cache = doc.toObject();
  return getRoleAccess();
}
