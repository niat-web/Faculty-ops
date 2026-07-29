import { Role } from "../enums";
import type { SessionUser } from "./rbac";
import { cmDarwinboxEmployeeId } from "./staffRoles";

const normId = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** undefined = not a CM; null = CM but Darwinbox id unresolved (fail closed); string = CM employee id */
export async function resolveCmScopeId(user: SessionUser): Promise<string | null | undefined> {
  if (user.role !== Role.CAPABILITY_MANAGER) return undefined;
  return cmDarwinboxEmployeeId(user);
}

/** Whether a master/Darwinbox row is in this CM's scope (Darwinbox reporting line OR app assignment). */
export function cmRowInScope(
  row: { reporting_manager_employee_id?: any; currentManagerId?: any },
  cmScopeId: string | null | undefined,
  userId?: string,
): boolean {
  if (cmScopeId === undefined) return true;
  if (userId && row.currentManagerId && String(row.currentManagerId) === userId) return true;
  if (!cmScopeId) return false;
  return normId(row.reporting_manager_employee_id) === normId(cmScopeId);
}

/** Filter live master rows to what this user may see (Ops/SM = all; CM = reportees only). */
export async function filterMasterRowsForUser<T extends { reporting_manager_employee_id?: any; currentManagerId?: any }>(
  user: SessionUser,
  rows: T[],
): Promise<T[]> {
  const cmScopeId = await resolveCmScopeId(user);
  if (cmScopeId === undefined) return rows;
  return rows.filter((r) => cmRowInScope(r, cmScopeId, user.id));
}
