import { Role } from "../enums";
import type { SessionUser } from "./rbac";

/** Build Mongo filters for listing edit requests. Returns null when the role may not list any. */
export function requestsListScope(user: SessionUser, status?: string): { q: Record<string, any>; bq: Record<string, any> } | null {
  if (user.role === Role.INSTRUCTOR) return null;

  const q: Record<string, any> = {};
  const bq: Record<string, any> = {};
  if (status) { q.status = status; bq.status = status; }

  if (user.role === Role.SENIOR_MANAGER) {
    q.$or = [{ approverId: user.id }, { requesterId: user.id }];
    bq.$or = [{ approverId: user.id }, { requesterId: user.id }];
  } else if (user.role === Role.CAPABILITY_MANAGER) {
    q.requesterId = user.id;
    bq.requesterId = user.id;
  }
  // Ops Admin: empty filter → all requests

  return { q, bq };
}

export function canCommentOnRequest(user: SessionUser, request: { requesterId?: any; approverId?: any }) {
  if (user.role === Role.OPS_ADMIN) return true;
  return String(request.requesterId) === user.id || String(request.approverId) === user.id;
}
