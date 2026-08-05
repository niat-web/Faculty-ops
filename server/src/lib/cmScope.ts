import { Role } from "../enums";
import type { SessionUser } from "./rbac";
import { cmDarwinboxEmployeeId } from "./staffRoles";

const normId = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** undefined = not a CM; null = CM but Darwinbox id unresolved (fail closed); string = CM employee id */
export async function resolveCmScopeId(user: SessionUser): Promise<string | null | undefined> {
  if (user.role !== Role.CAPABILITY_MANAGER) return undefined;
  return cmDarwinboxEmployeeId(user);
}

export type CmScopeMode = "all" | "teachos";

/**
 * Whether a master/Darwinbox row is in this CM's scope.
 * mode="all" (default): Darwinbox reporting line OR app assignment OR TeachOS mapping (the union).
 * mode="teachos": isolates just the TeachOS mapping — used by the Master grid's "TeachOS Only" tab
 * to show which reportees come specifically from the TeachOS sync, for auditing/verification.
 */
export function cmRowInScope(
  row: { reporting_manager_employee_id?: any; currentManagerId?: any; teachos_manager_user_id?: any },
  cmScopeId: string | null | undefined,
  userId?: string,
  mode: CmScopeMode = "all",
): boolean {
  if (cmScopeId === undefined) return true; // org-wide viewer, unaffected by mode
  if (mode === "teachos") {
    return !!(userId && row.teachos_manager_user_id && String(row.teachos_manager_user_id) === userId);
  }
  if (userId && row.currentManagerId && String(row.currentManagerId) === userId) return true;
  if (userId && row.teachos_manager_user_id && String(row.teachos_manager_user_id) === userId) return true;
  if (!cmScopeId) return false;
  return normId(row.reporting_manager_employee_id) === normId(cmScopeId);
}

/** Filter live master rows to what this user may see (Ops/SM = all; CM = reportees only). */
export async function filterMasterRowsForUser<T extends { reporting_manager_employee_id?: any; currentManagerId?: any; teachos_manager_user_id?: any }>(
  user: SessionUser,
  rows: T[],
  mode: CmScopeMode = "all",
): Promise<T[]> {
  const cmScopeId = await resolveCmScopeId(user);
  if (cmScopeId === undefined) return rows;
  return rows.filter((r) => cmRowInScope(r, cmScopeId, user.id, mode));
}
