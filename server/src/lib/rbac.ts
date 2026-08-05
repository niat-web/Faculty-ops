import { Role, roleCanSeeVisibility } from "../enums";
import { Instructor } from "../models";
import { roleHasPermission, type PermKey } from "./rolePermissions";

export interface SessionUser { id: string; email: string; name: string; role: string; managerId: string | null; }

export const isSuperAdmin = (u: SessionUser | { role: string }) => u.role === Role.SUPER_ADMIN;
export const isOpsLevel = (u: SessionUser | { role: string }) => u.role === Role.SUPER_ADMIN || u.role === Role.OPS_ADMIN;
export const isOrgWide = (u: SessionUser | { role: string }) => isOpsLevel(u) || u.role === Role.SENIOR_MANAGER;

export const canManageUsers = (u: SessionUser) => roleHasPermission(u.role, "manageUsers");
export const canEditDirectly = (u: SessionUser) => roleHasPermission(u.role, "edit") && isOrgWide(u);
export const canEditDetails = (u: SessionUser) => roleHasPermission(u.role, "edit") && (isOrgWide(u) || u.role === Role.CAPABILITY_MANAGER);
export const canManageSchema = (u: SessionUser) => roleHasPermission(u.role, "manageSchema");
export const canManageMapping = (u: SessionUser) => roleHasPermission(u.role, "manageMapping");
export const canApproveRequests = (u: SessionUser) => roleHasPermission(u.role, "approveRequests");
export const canViewAudit = (u: SessionUser) => roleHasPermission(u.role, "viewAudit");
export const canDeleteInstructor = (u: SessionUser) => roleHasPermission(u.role, "delete");
export const canManageSettings = (u: SessionUser) => roleHasPermission(u.role, "manageSettings");
export const canManageCertifications = (u: SessionUser) => roleHasPermission(u.role, "manageCertifications");
export const canViewData = (u: SessionUser) => roleHasPermission(u.role, "viewData");

export function requirePerm(perm: PermKey) {
  return (req: any, res: any, next: any) => (roleHasPermission(req.user?.role, perm) ? next() : res.status(403).json({ error: "Forbidden" }));
}

// Row-level scope: which instructors a viewer may see.
// A Capability Manager sees the union of the manual app assignment (currentManagerId, set via the
// Assignments page) AND anyone TeachOS's Capability-Manager mapping resolves to them
// (values.teachos_manager_user_id, written by teachosSync.ts — only ever a real, active
// CAPABILITY_MANAGER User's own id, never arbitrary). TeachOS is an ADDITIONAL grant, not a
// replacement — it never removes a manually-assigned reportee.
// The OR condition is wrapped in $and (not a bare top-level $or) on purpose: many callers merge this
// filter with their own `.$or = [...]` for text search (e.g. routes/instructors.ts) — a bare $or here
// would get silently clobbered by that assignment, widening a CM's visible rows to everyone. $and is
// a different key, so it always survives being merged/spread alongside a caller's own $or.
export function instructorScopeFilter(user: SessionUser): Record<string, any> {
  if (isOrgWide(user)) return {};
  if (user.role === Role.CAPABILITY_MANAGER) {
    return { $and: [{ $or: [{ currentManagerId: user.id }, { "values.teachos_manager_user_id": user.id }] }] };
  }
  return { email: user.email }; // instructor → only self
}

const normId = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function canAccessInstructor(user: SessionUser, instructorId: string) {
  if (isOrgWide(user)) return true;
  const inst: any = await Instructor.findById(instructorId).select("currentManagerId email values").lean();
  if (!inst) return false;
  if (user.role === Role.CAPABILITY_MANAGER) {
    if (String(inst.currentManagerId) === user.id) return true;
    if (String(inst.values?.teachos_manager_user_id || "") === user.id) return true;
    const { cmDarwinboxEmployeeId } = await import("./staffRoles");
    const cmId = await cmDarwinboxEmployeeId(user);
    if (!cmId) return false;
    const rmId = String(inst.values?.reporting_manager_employee_id || "")
      || (String(inst.values?.reporting_manager || "").match(/\((NW[^)]+)\)/i) || [])[1] || "";
    return normId(rmId) === normId(cmId);
  }
  return inst.email && inst.email === user.email;
}

export function filterVisibleFields<T extends { visibility: string }>(user: SessionUser, defs: T[]): T[] {
  return defs.filter((d) => roleCanSeeVisibility(user.role, d.visibility));
}
