import { Role, roleCanSeeVisibility } from "../enums";
import { Instructor } from "../models";

export interface SessionUser { id: string; email: string; name: string; role: string; managerId: string | null; }

export const canManageUsers = (u: SessionUser) => u.role === Role.OPS_ADMIN;
export const canEditDirectly = (u: SessionUser) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
// Capability Managers may now edit their OWN reportees' details directly (row-level scope still
// enforced via canAccessInstructor on every route). Ops/SM may edit anyone.
export const canEditDetails = (u: SessionUser) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER || u.role === Role.CAPABILITY_MANAGER;
export const canManageSchema = (u: SessionUser) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canManageMapping = (u: SessionUser) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canApproveRequests = (u: SessionUser) => u.role === Role.SENIOR_MANAGER;
export const canViewAudit = (u: SessionUser) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canDeleteInstructor = (u: SessionUser) => u.role === Role.OPS_ADMIN;

// Row-level scope: which instructors a viewer may see.
export function instructorScopeFilter(user: SessionUser): Record<string, any> {
  if (user.role === Role.OPS_ADMIN || user.role === Role.SENIOR_MANAGER) return {};
  if (user.role === Role.CAPABILITY_MANAGER) return { currentManagerId: user.id };
  return { email: user.email }; // instructor → only self
}

export async function canAccessInstructor(user: SessionUser, instructorId: string) {
  if (user.role === Role.OPS_ADMIN || user.role === Role.SENIOR_MANAGER) return true;
  const inst = await Instructor.findById(instructorId).select("currentManagerId email").lean();
  if (!inst) return false;
  if (user.role === Role.CAPABILITY_MANAGER) return String(inst.currentManagerId) === user.id;
  return inst.email && inst.email === user.email;
}

// Field-level visibility filter for a viewer.
export function filterVisibleFields<T extends { visibility: string }>(user: SessionUser, defs: T[]): T[] {
  return defs.filter((d) => roleCanSeeVisibility(user.role, d.visibility));
}
