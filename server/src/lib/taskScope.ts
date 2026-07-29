import { Role } from "../enums";
import type { SessionUser } from "./rbac";
import { getTasksSettings } from "./settings";

export async function canAssignTasks(user: SessionUser): Promise<boolean> {
  if (user.role === Role.OPS_ADMIN) return true;
  const s = await getTasksSettings();
  if (user.role === Role.CAPABILITY_MANAGER) return s.cmCanAssignToInstructors;
  if (user.role === Role.SENIOR_MANAGER) return s.seniorManagerCanAssign;
  return false;
}

export function canDeleteTask(user: SessionUser, task: { assignerId?: any }): boolean {
  if (user.role === Role.OPS_ADMIN) return true;
  return String(task.assignerId) === user.id;
}

export function canMarkDone(user: SessionUser, task: { assigneeId?: any }): boolean {
  if (user.role === Role.OPS_ADMIN) return true;
  return String(task.assigneeId) === user.id;
}

export function canViewTask(user: SessionUser, task: { assigneeId?: any; assignerId?: any }): boolean {
  if (user.role === Role.OPS_ADMIN) return true;
  return String(task.assigneeId) === user.id || String(task.assignerId) === user.id;
}
