import { Instructor, User } from "../models";
import { fetchTeachosRows, TeachosRow } from "./teachosSheet";

// Hourly TeachOS (Google Sheet) → MongoDB persist. Matches sheet rows to instructors by UID
// (instructor_user_id ↔ Instructor.uid, hyphen/case-normalized — UUIDs differ by format across
// systems, same as the BigQuery training match in bigqueryTraining.ts) and writes read-only fields
// into Instructor.values:
//   teachos_role, teachos_institute_name          — straight from the sheet (any of the instructor's rows).
//   teachos_manager_category                      — the category of whichever row resolved a real CM (below).
//   teachos_manager_employee_id, teachos_manager_name — the CAPABILITY MANAGER, resolved carefully:
//
// TeachOS carries ONE ROW PER (instructor, category) — an instructor can have several rows (TECH,
// APTITUDE, ENGLISH, MATH, …), each naming a different category-specific mentor/trainer. Only SOME
// of those named people are actual Capability Managers in this app's RBAC (User.role=
// CAPABILITY_MANAGER); the rest are other kinds of trainers TeachOS also tracks. So instead of
// trusting whichever row happens to match an Instructor.uid (any instructor), we first build the set
// of REAL Capability Manager UIDs — the ~17 active CAPABILITY_MANAGER Users, resolved to their own
// Instructor.uid via email — and only treat a sheet row's managerUid as "the" Capability Manager when
// it's IN that set. An instructor with no row matching a real CM gets these fields cleared (we don't
// fall back to a random category trainer's name).
//
// teachos_manager_user_id — the resolved Capability Manager's own Mongo User._id (as a string). This
// is a SCOPE-GRANTING field: instructorScopeFilter (lib/rbac.ts) ORs it in alongside currentManagerId,
// so a Capability Manager whose TeachOS mapping resolves to them sees that instructor as a reportee
// EVERYWHERE in the app (Dashboard, Requests, Training, Contribution, Org chart) — not just on the
// Master grid's display column. This does NOT touch Instructor.currentManagerId itself (no audit log
// entry, no "reassigned" notification) — the manual Assignments-page relationship is untouched and
// still wins/coexists; TeachOS is an additional, independent grant of visibility, not a replacement.
// Because it's only ever set from cmByUid (real, active CAPABILITY_MANAGER Users only — see above),
// it can never point at an arbitrary/unresolved id.
//
// teachos_matched — "1" for every instructor TeachOS lists AT ALL, regardless of whether a real CM
// resolved. Used ONLY for Ops's org-wide "TeachOS Only" coverage view on the Master grid (how many
// instructors does TeachOS know about, period) — a broader question than "who reports to a CM via
// TeachOS," which is what teachos_manager_user_id answers.
//
// Safety rule (mirrors trainingSync.ts): only instructors matched by a sheet row this run are
// touched. An instructor with no UID match is left completely untouched — a transient sheet fetch
// hiccup or a UID that hasn't been backfilled yet never blanks out previously-synced data.

const normId = (v: any) => String(v ?? "").replace(/-/g, "").toLowerCase().trim();

const TEACHOS_KEYS = [
  "teachos_manager_category",
  "teachos_role",
  "teachos_institute_name",
  "teachos_manager_employee_id",
  "teachos_manager_name",
  "teachos_manager_user_id",
  "teachos_matched",
] as const;

export type TeachosSyncReport = { ok: boolean; matched: number; managersResolved: number; updated: number; scanned: number; error?: string };

export async function persistTeachosSync(): Promise<TeachosSyncReport> {
  const docs = await Instructor.find({}).select("employeeId uid name email values"); // full Mongoose docs — .values is a Map, and we .save() below
  const scanned = docs.length;

  const byUid = new Map<string, (typeof docs)[number]>();
  const byEmail = new Map<string, (typeof docs)[number]>();
  for (const d of docs as any[]) {
    const uidKey = normId(d.uid);
    if (uidKey && !byUid.has(uidKey)) byUid.set(uidKey, d);
    const emailKey = String(d.email || "").trim().toLowerCase();
    if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, d);
  }

  // The real Capability Manager set: active CAPABILITY_MANAGER Users, resolved to their OWN
  // Instructor.uid via email (small — a few dozen at most, so this join is cheap).
  const cmUsers = await User.find({ role: "CAPABILITY_MANAGER", active: true }).select("email name").lean();
  const cmByUid = new Map<string, { userId: string; employeeId: string; name: string }>();
  for (const cm of cmUsers as any[]) {
    const inst = byEmail.get(String(cm.email || "").trim().toLowerCase());
    const uidKey = inst ? normId((inst as any).uid) : "";
    if (uidKey) cmByUid.set(uidKey, { userId: String(cm._id), employeeId: (inst as any).employeeId, name: cm.name });
  }

  let rows: TeachosRow[];
  try {
    rows = await fetchTeachosRows();
  } catch (e: any) {
    return { ok: false, matched: 0, managersResolved: 0, updated: 0, scanned, error: e?.message || "TeachOS sheet fetch failed" };
  }

  // Group sheet rows by instructor (multiple category rows per instructor are normal).
  const rowsByInstructor = new Map<string, TeachosRow[]>();
  for (const row of rows) {
    const key = normId(row.instructorUid);
    if (!key) continue;
    const list = rowsByInstructor.get(key);
    if (list) list.push(row); else rowsByInstructor.set(key, [row]);
  }

  let matched = 0;
  let managersResolved = 0;
  let updated = 0;
  for (const [uidKey, instRows] of rowsByInstructor) {
    const inst: any = byUid.get(uidKey);
    if (!inst) continue;
    matched++;

    const cmRow = instRows.find((r) => cmByUid.has(normId(r.managerUid)));
    const cm = cmRow ? cmByUid.get(normId(cmRow.managerUid)) : undefined;
    if (cm) managersResolved++;

    const firstRow = instRows[0];
    const next: Record<string, string> = {
      teachos_manager_category: cmRow ? cmRow.managerCategory : "",
      teachos_role: firstRow.role,
      teachos_institute_name: firstRow.instituteName,
      teachos_manager_employee_id: cm ? cm.employeeId : "",
      teachos_manager_name: cm ? cm.name : "",
      teachos_manager_user_id: cm ? cm.userId : "",
      // Set for EVERY instructor TeachOS lists at all (even when no row resolves to a real CM) — the
      // broader "known to TeachOS" signal, used by Ops's org-wide coverage view (vs. teachos_manager_user_id,
      // which is narrower — only set when a real Capability Manager was resolved).
      teachos_matched: "1",
    };
    let changed = false;
    for (const key of TEACHOS_KEYS) {
      if ((inst.values.get(key) || "") !== (next[key] || "")) { inst.values.set(key, next[key]); changed = true; }
    }
    if (changed) {
      try { await inst.save(); updated++; }
      catch (e: any) { console.warn(`[teachos-sync] instructor ${inst._id}: ${e?.message || e}`); }
    }
  }

  return { ok: true, matched, managersResolved, updated, scanned };
}
