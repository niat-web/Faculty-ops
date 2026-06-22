/**
 * Reconcile the live Atlas data against the canonical NIAT CSVs.
 *
 *   MASTER.csv  → active people (597)   — fixed layout, HOD col at [6], State/District/City at [25..27]
 *   EXIT.csv    → exited people (276)   — no HOD col, Type/Reason/Detailed exit at [23..25]
 *   4 central files (Garlapati/Vamsi/Nunna/Rahul) → org hierarchy + the SM "Rahul Attuluri"
 *
 * Behaviour: match by Employee ID; UPDATE only fields whose CSV value is non-empty AND differs;
 * ADD people not in the DB; never blank a DB value from an empty CSV cell; leave correct data alone.
 *
 * Default = DRY RUN (prints the full diff, writes nothing). Pass `--apply` to commit.
 *
 *   tsx scripts/reconcile-niat.ts            # dry run
 *   tsx scripts/reconcile-niat.ts --apply    # commit
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Papa from "papaparse";
import { Instructor, User } from "../src/models";

// Canonical user display names (live → CSV form). CSV is source of truth.
const RENAME: Record<string, string> = {
  "Hari Krishna": "Hari Krishna Daggubati",
  "Sai sankar sigatapu": "Sigatapu Sai Sankar",
  "shaik mohammed pasha": "Shaik Mohammed Pasha",
};
const RAHUL_EMAIL = "rahul.attuluri@nxtwave.co.in";

const APPLY = process.argv.includes("--apply");
const DL = "C:/Users/NxtWave/Downloads";
const ROSTER = `${DL}/drive-download-20260618T074352Z-3-001`;
const MASTER_CSV = `${DL}/NIAT Academics Master Data - MASTER.csv`;
const EXIT_CSV = `${DL}/NIAT Academics Master Data - EXIT.csv`;

const DELIVERY_DEPT = "Instructors - Delivery Support (Ops and Central managers)";
const EXIT_STATES = ["EXITED", "EXIT_IN_PROGRESS"];

// ── cell hygiene ────────────────────────────────────────────────────────────
const JUNK = new Set(["", "#ref!", "#n/a", "na", "n/a", "#value!", "null", "undefined"]);
const clean = (v: any): string => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return JUNK.has(s.toLowerCase()) ? "" : s;
};
const cleanId = (v: any): string => {
  const s = String(v ?? "").trim();
  return /^NW[\w]+$/i.test(s) ? s.toUpperCase() : "";
};
// normalise a person/manager name to a sorted token set for fuzzy matching
const tokens = (n: string) => clean(n).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
const tokenKey = (n: string) => tokens(n).slice().sort().join(" ");

const read = (p: string): string[][] =>
  (Papa.parse(fs.readFileSync(p, "utf8"), { skipEmptyLines: false }).data as string[][]).filter((r) => r && r.length > 1);

// ── column → field maps ──────────────────────────────────────────────────────
// value-field key → column index (MASTER layout). Core/manager handled separately.
const MASTER_VALCOLS: Record<string, number> = {
  department: 2, contribution: 5, hod_interaction: 6, contribution_region: 7, reporting_manager: 8,
  payroll_entity: 9, designation: 10, phone: 11, university_mail: 13, doj: 14, qualification: 15,
  domain: 16, gender: 18, native_language: 19, access_status: 20, cm_employee_id: 21, exit_date: 22,
  remarks: 23, workspace: 24, emp_state: 25, emp_district: 26, emp_city: 27,
};
const EXIT_VALCOLS: Record<string, number> = {
  department: 2, contribution: 5, contribution_region: 6, reporting_manager: 7, payroll_entity: 8,
  designation: 9, phone: 10, university_mail: 12, doj: 13, qualification: 14, domain: 15,
  gender: 17, native_language: 18, access_status: 19, cm_employee_id: 20, exit_date: 21, remarks: 22,
};
// core columns differ slightly between the two layouts
const MASTER_CORE = { employeeId: 0, name: 1, campus: 4, email: 12, uid: 17, cm: 3 };
const EXIT_CORE = { employeeId: 0, name: 1, campus: 4, email: 11, uid: 16, cm: 3 };

interface Person {
  employeeId: string; name: string; campus: string; email: string; uid: string; cmName: string;
  values: Record<string, string>;
  exited: boolean;
  exit?: { typeOfExit: string; reason: string; detailedReason: string; lastWorkingDay: string };
}

function parseFile(p: string, exited: boolean): { people: Person[]; unkeyed: string[] } {
  const rows = read(p);
  const core = exited ? EXIT_CORE : MASTER_CORE;
  const valcols = exited ? EXIT_VALCOLS : MASTER_VALCOLS;
  const people: Person[] = [];
  const unkeyed: string[] = [];
  for (const r of rows.slice(1)) {
    const id = cleanId(r[core.employeeId]);
    const name = clean(r[core.name]);
    if (!name) continue;
    if (!id) { unkeyed.push(`${name} | ${clean(r[valcols.department]) || "?"}`); continue; }
    const values: Record<string, string> = {};
    for (const [k, i] of Object.entries(valcols)) { const v = clean(r[i]); if (v) values[k] = v; }
    const person: Person = {
      employeeId: id, name, campus: clean(r[core.campus]), email: clean(r[core.email]).toLowerCase(),
      uid: clean(r[core.uid]), cmName: clean(r[core.cm]), values, exited,
    };
    if (exited) person.exit = {
      typeOfExit: clean(r[23]), reason: clean(r[24]), detailedReason: clean(r[25]),
      lastWorkingDay: clean(r[21]),
    };
    people.push(person);
  }
  return { people, unkeyed };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log(`\n${"=".repeat(70)}\nRECONCILE  ${APPLY ? ">>> APPLY (writing to prod) <<<" : "(dry run — no writes)"}\nDB: ${mongoose.connection.name}\n${"=".repeat(70)}`);

  const master = parseFile(MASTER_CSV, false);
  const exit = parseFile(EXIT_CSV, true);

  // Merge: EXIT wins on status; if someone is in both, exited record takes precedence.
  const byId = new Map<string, Person>();
  for (const p of master.people) byId.set(p.employeeId, p);
  let bothCount = 0;
  for (const p of exit.people) { if (byId.has(p.employeeId)) bothCount++; byId.set(p.employeeId, p); }
  console.log(`\nCSV: master=${master.people.length}, exit=${exit.people.length}, in-both=${bothCount}, unique=${byId.size}`);
  console.log(`Unkeyed (no Employee ID, skipped): master=${master.unkeyed.length}, exit=${exit.unkeyed.length}`);

  // ── PHASE A: org hierarchy (names, Rahul as SM, reporting lines) ──────────
  console.log(`\n── PHASE A: hierarchy ──`);
  for (const [from, to] of Object.entries(RENAME)) {
    const u: any = await User.findOne({ name: from });
    if (u) { console.log(`  rename user "${from}" → "${to}"`); if (APPLY) { u.name = to; await u.save(); } }
  }
  let rahul: any = await User.findOne({ name: /rahul attuluri/i });
  if (!rahul) {
    console.log(`  + create Senior Manager: Rahul Attuluri (${RAHUL_EMAIL})`);
    if (APPLY) rahul = await User.create({
      name: "Rahul Attuluri", email: RAHUL_EMAIL, role: "SENIOR_MANAGER",
      passwordHash: await bcrypt.hash("nw-" + Math.random().toString(36).slice(2), 10),
      mustSetPassword: true, active: true,
    });
  }
  const vamsi: any = await User.findOne({ name: /vamsi tallam/i });
  const garlapati: any = await User.findOne({ name: /garlapati prudhvi/i });
  if (rahul && vamsi && String(vamsi.managerId || "") !== String(rahul._id)) {
    console.log(`  Vamsi Tallam → reports to Rahul Attuluri`); if (APPLY) { vamsi.managerId = rahul._id; await vamsi.save(); }
  }
  if (vamsi && garlapati && String(garlapati.managerId || "") !== String(vamsi._id)) {
    console.log(`  Garlapati Prudhvi Raj → reports to Vamsi Tallam`); if (APPLY) { garlapati.managerId = vamsi._id; await garlapati.save(); }
  }

  // ── manager matching over CMs + SMs (central staff report to an SM) ───────
  const cms: any[] = await User.find({ role: { $in: ["CAPABILITY_MANAGER", "SENIOR_MANAGER"] } }).select("name").lean();
  const cmByKey = new Map<string, any>();
  for (const c of cms) cmByKey.set(tokenKey(c.name), c);
  const matchCM = (name: string): any | null => {
    const k = tokenKey(name); if (!k) return null;
    if (cmByKey.has(k)) return cmByKey.get(k);
    const want = new Set(tokens(name));
    let best: any = null, bestOverlap = 0;
    for (const c of cms) {
      const have = new Set(tokens(c.name));
      const overlap = [...want].filter((t) => have.has(t)).length;
      const subset = overlap === want.size || overlap === have.size;
      if (subset && overlap >= 2 && overlap > bestOverlap) { best = c; bestOverlap = overlap; }
    }
    return best;
  };

  // ── diff & apply per person ──────────────────────────────────────────────
  const live: any[] = await Instructor.find().lean();
  const liveById = new Map(live.map((i: any) => [i.employeeId, i]));
  const cmMissNames = new Set<string>();
  let toAdd = 0, fieldUpdates = 0, statusFlips = 0, mgrSets = 0, exitSets = 0, touched = 0;
  const addSamples: string[] = [];
  const bulk: any[] = [];

  for (const p of byId.values()) {
    const cm = p.cmName ? matchCM(p.cmName) : null;
    if (p.cmName && !cm) cmMissNames.add(p.cmName);
    const cur: any = liveById.get(p.employeeId);

    if (!cur) {
      toAdd++;
      if (addSamples.length < 25) addSamples.push(`  + ${p.employeeId}  ${p.name}  [${p.values.department || "?"}]${p.exited ? "  (EXITED)" : ""}${cm ? `  CM=${cm.name}` : ""}`);
      if (APPLY) bulk.push({ insertOne: { document: {
        employeeId: p.employeeId, name: p.name, email: p.email || null, campus: p.campus || null, uid: p.uid || null,
        status: p.exited ? "EXITED" : "ONBOARDING", currentManagerId: cm?._id || null, values: p.values,
        ...(p.exit ? { exit: { ...p.exit, items: {} } } : {}),
      } } });
      continue;
    }

    // existing → field-level diff
    const set: Record<string, any> = {};
    const diffs: string[] = [];
    const setCore = (k: string, csv: string, dbv: any) => { if (csv && csv !== (dbv ?? "")) { set[k] = csv; diffs.push(`${k}: "${dbv ?? ""}"→"${csv}"`); } };
    setCore("name", p.name, cur.name);
    if (p.email && p.email !== (cur.email ?? "")) { set.email = p.email; diffs.push(`email→${p.email}`); }
    setCore("campus", p.campus, cur.campus);
    setCore("uid", p.uid, cur.uid);
    for (const [k, v] of Object.entries(p.values)) {
      const dbv = (cur.values || {})[k] ?? "";
      if (v && v !== dbv) { set[`values.${k}`] = v; diffs.push(`${k}: "${dbv}"→"${v}"`); }
    }
    if (diffs.length) fieldUpdates += diffs.length;

    // manager
    if (cm && String(cur.currentManagerId || "") !== String(cm._id)) { set.currentManagerId = cm._id; diffs.push(`CM→${cm.name}`); mgrSets++; }

    // status: EXIT people → EXITED; MASTER people currently exited → reactivate to CONFIRMED
    let newStatus: string | null = null;
    if (p.exited && !EXIT_STATES.includes(cur.status)) newStatus = "EXITED";
    else if (!p.exited && EXIT_STATES.includes(cur.status)) newStatus = "CONFIRMED";
    if (newStatus) { set.status = newStatus; diffs.push(`status: ${cur.status}→${newStatus}`); statusFlips++; }

    // exit subdoc
    if (p.exit) {
      for (const k of ["typeOfExit", "reason", "detailedReason", "lastWorkingDay"] as const) {
        if (p.exit[k] && p.exit[k] !== (cur.exit?.[k] ?? "")) { set[`exit.${k}`] = p.exit[k]; }
      }
      if (Object.keys(set).some((k) => k.startsWith("exit."))) exitSets++;
    }

    if (Object.keys(set).length) {
      touched++;
      if (touched <= 30) console.log(`  ~ ${p.employeeId} ${p.name}: ${diffs.slice(0, 6).join("; ")}${diffs.length > 6 ? ` …(+${diffs.length - 6})` : ""}`);
      if (APPLY) bulk.push({ updateOne: { filter: { _id: cur._id }, update: { $set: set } } });
    }
  }

  console.log(`\n── DIFF SUMMARY ──`);
  console.log(`People to ADD: ${toAdd}`);
  if (addSamples.length) console.log(addSamples.join("\n") + (toAdd > addSamples.length ? `\n  …(+${toAdd - addSamples.length} more)` : ""));
  console.log(`Existing people TOUCHED: ${touched}  (field updates: ${fieldUpdates}, manager sets: ${mgrSets}, status flips: ${statusFlips}, exit-subdoc sets: ${exitSets})`);
  if (cmMissNames.size) console.log(`\n⚠ Capability Manager names in CSV with NO matching CM user (${cmMissNames.size}):\n  ${[...cmMissNames].join("\n  ")}`);

  if (APPLY && bulk.length) {
    try {
      const r = await Instructor.bulkWrite(bulk, { ordered: false });
      console.log(`\n✓ APPLIED instructors: inserted=${r.insertedCount}, modified=${r.modifiedCount}`);
    } catch (e: any) {
      // ordered:false applies all valid ops; dup-key/validation failures are reported, not fatal.
      const res = e?.result;
      console.log(`\n✓ APPLIED instructors (with skips): inserted=${res?.insertedCount ?? "?"}, modified=${res?.modifiedCount ?? "?"}`);
      const errs = (e?.writeErrors || []).map((w: any) => `    skip: ${w?.err?.errmsg || w?.errmsg || "?"}`.slice(0, 160));
      console.log(`  ${e?.writeErrors?.length || 0} write(s) skipped:\n${[...new Set(errs)].slice(0, 12).join("\n")}`);
    }
  } else if (!APPLY) {
    console.log(`\n(dry run) — re-run with --apply to write these ${toAdd + touched} instructor changes.`);
  }

  // ── PHASE D: Ops-Admin login accounts for Delivery-Support central staff ──
  // Anyone in the Delivery-Support dept with an email and no existing User → OPS_ADMIN
  // (mustSetPassword). People who are already CM/SM users keep their manager role.
  console.log(`\n── PHASE D: Ops-Admin accounts (Delivery-Support staff) ──`);
  const central = [...byId.values()].filter((p) => p.values.department === DELIVERY_DEPT && p.email);
  const KEEP_ROLES = new Set(["CAPABILITY_MANAGER", "SENIOR_MANAGER"]); // don't downgrade managers
  let opsCreated = 0, opsUpgraded = 0; const opsSamples: string[] = [];
  for (const p of central) {
    const existing: any = await User.findOne({ email: p.email }).select("role name");
    if (!existing) {
      opsCreated++;
      if (opsSamples.length < 40) opsSamples.push(`  + create ${p.name}  <${p.email}>  (OPS_ADMIN, pending)`);
      if (APPLY) await User.create({
        name: p.name, email: p.email, role: "OPS_ADMIN",
        passwordHash: await bcrypt.hash("nw-" + Math.random().toString(36).slice(2), 10),
        mustSetPassword: true, active: true,
      });
    } else if (existing.role === "INSTRUCTOR") {
      opsUpgraded++;
      if (opsSamples.length < 40) opsSamples.push(`  ↑ upgrade ${existing.name}  <${p.email}>  INSTRUCTOR → OPS_ADMIN`);
      if (APPLY) { existing.role = "OPS_ADMIN"; await existing.save(); }
    } // CM/SM/OPS_ADMIN → leave as-is
  }
  console.log(opsSamples.join("\n"));
  console.log(`Ops-Admin accounts — ${APPLY ? "created" : "to create"}: ${opsCreated}, ${APPLY ? "upgraded" : "to upgrade"}: ${opsUpgraded}`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
