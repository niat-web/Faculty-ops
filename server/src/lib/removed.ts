import { RemovedInstructor } from "../models";
import { norm } from "./darwinboxSync";

// The set of HIDDEN Employee IDs (normalized), cached briefly so the many callers that filter on it
// don't each hit Mongo. Any change (remove/restore) clears the cache so the effect is immediate.
let cache: { at: number; set: Set<string> } | null = null;
const TTL_MS = 30 * 1000;

export async function removedEmployeeIdSet(force?: boolean): Promise<Set<string>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.set;
  const docs = await RemovedInstructor.find({}).select("employeeId").lean();
  const set = new Set<string>((docs as any[]).map((d) => norm(d.employeeId)).filter(Boolean));
  cache = { at: Date.now(), set };
  return set;
}

export function clearRemovedCache() { cache = null; }

// True if this Employee ID has been hidden.
export async function isRemoved(employeeId: string): Promise<boolean> {
  const set = await removedEmployeeIdSet();
  return set.has(norm(employeeId));
}

// The RAW (as-stored) hidden Employee IDs — for building a Mongo `$nin` on Instructor.employeeId.
// Employee IDs are stored consistently (e.g. "NW0001234"), so an exact-match $nin is correct.
export async function removedEmployeeIdList(): Promise<string[]> {
  const docs = await RemovedInstructor.find({}).select("employeeId").lean();
  return (docs as any[]).map((d) => String(d.employeeId || "").trim()).filter(Boolean);
}

// The lowercased emails of hidden people — for hiding their login account from the Users table
// (Users are keyed by email, not Employee ID). Empty emails are skipped.
export async function removedEmailList(): Promise<string[]> {
  const docs = await RemovedInstructor.find({}).select("email").lean();
  return [...new Set((docs as any[]).map((d) => String(d.email || "").trim().toLowerCase()).filter(Boolean))];
}
