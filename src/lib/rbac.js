import { connectDB } from "./db.js";
import { Instructor } from "@/models/index.js";
import { Role, roleCanSeeVisibility } from "./enums.js";

// Mongo filter limiting which instructors a user may read.
export function instructorScopeFilter(user) {
  switch (user.role) {
    case Role.OPS_ADMIN:
    case Role.SENIOR_MANAGER:
      return {};
    case Role.CAPABILITY_MANAGER:
      return { currentManagerId: user.id };
    case Role.INSTRUCTOR:
      // Instructors are matched to their own record by email.
      return { email: user.email };
    default:
      return { _id: null };
  }
}

export async function canAccessInstructor(user, instructorId) {
  await connectDB();
  const found = await Instructor.findOne({
    $and: [{ _id: instructorId }, instructorScopeFilter(user)],
  })
    .select("_id")
    .lean();
  return Boolean(found);
}

export const canEditDirectly = (u) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canManageSchema = (u) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canManageMapping = (u) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;
export const canManageUsers = (u) => u.role === Role.OPS_ADMIN;
export const canApproveRequests = (u) => u.role === Role.SENIOR_MANAGER;
export const canSubmitRequests = (u) => u.role === Role.CAPABILITY_MANAGER;
export const canViewAudit = (u) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER;

// Drop field definitions the viewer's role may not see.
export function filterVisibleFields(user, defs) {
  return defs.filter((d) => roleCanSeeVisibility(user.role, d.visibility));
}
