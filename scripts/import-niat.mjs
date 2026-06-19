// Import the real NIAT academics data (30 CSVs) into MongoDB.
//
// Sources (two Google-Drive export folders under ~/Downloads):
//   • Roster files  — per-Capability-Manager sheets + MASTER + EXIT + central
//                     team sheets (Garlapati / Vamsi / Rahul / Nunna). Each row
//                     is one person with full HR detail + a "Capability Manager
//                     ID" pointing at their manager's Employee ID.
//   • Track files   — ENGLISH / TECH / MDATA / Mathematical&Aptitude: training
//                     progress (tracks, %, health, per-module status).
//
// What it does:
//   1. Merges every roster row by Employee ID.
//   2. Builds the org tree from Employee-ID → Manager-ID edges and assigns the
//      app role by depth: leaf = INSTRUCTOR, manages instructors = CAPABILITY_
//      MANAGER, manages managers = SENIOR_MANAGER. Ops Admins are left alone.
//   3. Creates User accounts for SMs + CMs (and instructors that have a real
//      email) with NO usable password — they set it later via the e-mail link.
//   4. Creates Instructor profiles (HR fields, exit block, lifecycle status).
//   5. Overlays training progress from the 4 track sheets.
//   6. Auto-creates any dynamic FieldDefinition that doesn't exist yet, so every
//      column is visible in the UI.
//
// Re-runnable: wipes all non-OpsAdmin users + all instructors first (keeps Ops
// Admins and the dynamic-field catalog).
//
//   npm run import-niat
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Papa from "papaparse";

// ---- env -------------------------------------------------------------------
try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set in .env"); process.exit(1); }

const DL = path.join(process.env.USERPROFILE || process.env.HOME, "Downloads");
const DIR_A = path.join(DL, "drive-download-20260618T074352Z-3-001"); // roster + master + exit
const DIR_B = path.join(DL, "drive-download-20260618T074354Z-3-001"); // track sheets

const dir = path.dirname(fileURLToPath(import.meta.url));
const { User, Instructor, FieldDefinition, AuditLog } =
  await import(pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href);

// ---- helpers ---------------------------------------------------------------
const JUNK = new Set(["", "na", "n/a", "#ref!", "#n/a", "none", "null", "-"]);
const clean = (v) => {
  const s = (v == null ? "" : String(v)).trim();
  return JUNK.has(s.toLowerCase()) ? "" : s;
};
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");
const empIdOf = (v) => { const m = String(v || "").match(/NW\d{4,}/i); return m ? m[0].toUpperCase() : ""; };
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}|^\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}|^\d{1,2}[-/]\w{3,}[-/]\d{4}|GMT/;
function parseDate(v) {
  const s = clean(v);
  if (!s || !DATE_SHAPE.test(s)) return null; // only attempt real date shapes
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2000 || y > 2035) return null;
  return d.toISOString().slice(0, 10);
}
function pct(v) {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  if (isNaN(n)) return null;
  return String(Math.round((n <= 1 ? n * 100 : n)));
}

// Roster column aliases (normalized header → field).
const COLS = {
  employeeId: ["employeeid"],
  name: ["name"],
  department: ["department"],
  capabilityManager: ["capabilitymanager"],
  workLocation: ["worklocation"],
  contribution: ["contribution"],
  contributionRegion: ["contributionregion"],
  reportingManager: ["reportingmanagerdawrin", "reportingmanager"],
  payrollEntity: ["payroll"],
  designation: ["role"],
  phone: ["phonenumber"],
  mail: ["mailid"],
  universityMail: ["universitymailid"],
  doj: ["doj"],
  qualification: ["qualificationbtechmtechmscetc", "qualification"],
  domain: ["domaincomputersciencemathsenglishecemechetc", "domain"],
  uid: ["uid"],
  gender: ["gender"],
  nativeLanguage: ["nativelanguage"],
  capabilityManagerId: ["capabilitymanagerid", "capabilitymanageremployeeid"],
  exitDate: ["exitdate"],
  remarks: ["remarks"],
  typeOfExit: ["typeofexit"],
  reasonForExit: ["reasonforexit"],
  detailedReason: ["indetailedreason"],
  empState: ["employeestate"],
  empDistrict: ["district"],
  empCity: ["city"],
  workspace: ["june2026workspace"],
};
function rosterIndex(headerRow) {
  const nh = headerRow.map(norm);
  const idx = {};
  for (const [field, aliases] of Object.entries(COLS)) {
    idx[field] = nh.findIndex((h) => aliases.includes(h));
  }
  idx.access = nh.findIndex((h) => h.startsWith("portalacesses"));
  return idx;
}

function parseCsv(file) {
  const raw = readFileSync(file, "utf8");
  return Papa.parse(raw, { skipEmptyLines: false }).data; // array of arrays
}

// ---- 1. read all roster files ---------------------------------------------
// Non-EXIT roster files. Leading columns (0..Remarks) align with the header;
// the 3 trailing data cells are always State / District / City (the header
// labels them Type/Reason/Indetailed but the data omits those and appends
// geography instead). EXIT.csv is handled separately below.
const ROSTER_FILES = [
  // central / leadership first so manager records exist
  "Rahul Attuluri.csv", "Vamsi Tallam.csv", "Garlapati Prudhvi Raj.csv",
  "Nunna Naga Venkata Dasaradhi_1.csv",
  // master (union of instructors)
  "MASTER.csv",
  // per-capability-manager rosters
  "Akhilendar Reddy K.csv", "Challakonda Bharath.csv", "Dharavath Jayanth.csv",
  "Hari Krishna Daggubati.csv", "Kalyani Korrapati.csv", "Katuri Karthik.csv",
  "Meka Sri Satya Prudhvi Charan.csv", "Penumarthi Satya Syamala.csv", "Pradeep.csv",
  "Preethi Vangaveti.csv", "Riya rai .csv", "Shaik Mohammed Pasha.csv",
  "Sigatapu Sai Sankar.csv", "Vinitha Naraharisetti.csv", "Voppangi Sai Prasanna.csv",
  "Vulpe harini.csv",
];

const INDIAN_STATES = new Set(["andhra pradesh","telangana","tamil nadu","kerala","karnataka","maharashtra","gujarat","rajasthan","uttar pradesh","bihar","west bengal","odisha","madhya pradesh","jharkhand","punjab","haryana","delhi","assam","chhattisgarh","uttarakhand","himachal pradesh","goa","tripura","manipur","meghalaya","nagaland"]);
const looksGeoState = (s) => INDIAN_STATES.has(String(s || "").trim().toLowerCase());

const people = new Map();        // empId -> merged fields
const nameIndex = new Map();     // normalized name -> empId (to merge #REF! rows)
let synthSeq = 0;
const looksGeo = (s) => s && !isEmail(s) && !parseDate(s) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s) && !/^\d+$/.test(s);

function mergeField(rec, key, val) {
  const v = clean(val);
  if (v && !rec[key]) rec[key] = v;
}

for (const fname of ROSTER_FILES) {
  const file = path.join(DIR_A, fname);
  if (!existsSync(file)) { console.warn("  (missing)", fname); continue; }
  const rows = parseCsv(file);
  if (!rows.length) continue;
  const idx = rosterIndex(rows[0]);
  if (idx.employeeId < 0 && idx.name < 0) continue;
  const get = (row, field) => (idx[field] >= 0 ? clean(row[idx[field]]) : "");

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => clean(c) === "")) continue;
    const name = get(row, "name");
    if (!name) continue;
    const nkey = norm(name);

    let id = empIdOf(idx.employeeId >= 0 ? row[idx.employeeId] : "");
    if (!id) {
      // no usable Employee ID → reuse an existing person with the same name,
      // else mint a synthetic id.
      id = nameIndex.get(nkey);
      if (!id) { id = `TMP-${++synthSeq}`; }
    }
    if (!nameIndex.has(nkey)) nameIndex.set(nkey, id);

    const rec = people.get(id) || { empId: id, _synthetic: id.startsWith("TMP-") };
    if (!rec.name) rec.name = name;

    mergeField(rec, "department", get(row, "department"));
    mergeField(rec, "capabilityManager", get(row, "capabilityManager"));
    mergeField(rec, "workLocation", get(row, "workLocation"));
    mergeField(rec, "contribution", get(row, "contribution"));
    mergeField(rec, "contributionRegion", get(row, "contributionRegion"));
    mergeField(rec, "reportingManager", get(row, "reportingManager"));
    mergeField(rec, "payrollEntity", get(row, "payrollEntity"));
    mergeField(rec, "designation", get(row, "designation"));
    mergeField(rec, "phone", get(row, "phone"));
    mergeField(rec, "domain", get(row, "domain"));
    mergeField(rec, "qualification", get(row, "qualification"));
    mergeField(rec, "uid", get(row, "uid"));
    mergeField(rec, "gender", get(row, "gender"));
    mergeField(rec, "nativeLanguage", get(row, "nativeLanguage"));
    mergeField(rec, "access", get(row, "access"));
    mergeField(rec, "workspace", get(row, "workspace"));
    mergeField(rec, "doj", parseDate(get(row, "doj")) || "");

    // emails: prefer a real Mail ID, else University Mail Id
    const mail = get(row, "mail").toLowerCase();
    const umail = get(row, "universityMail").toLowerCase();
    if (!rec.email && isEmail(mail)) rec.email = mail;
    if (!rec.universityMail && isEmail(umail)) rec.universityMail = umail;

    // manager edge
    const mgr = empIdOf(get(row, "capabilityManagerId"));
    if (mgr && !rec.managerEmpId) rec.managerEmpId = mgr;

    // Is this an exit row? (explicit "Exit" work location or a real exit date)
    const exitDate = parseDate(get(row, "exitDate"));
    const isExitRow = !!exitDate || /^exit$/i.test(get(row, "workLocation"));
    if (isExitRow) { rec.isExit = true; if (exitDate) mergeField(rec, "exitDate", exitDate); }

    // The 3 trailing data cells are State/District/City for an ACTIVE row, but
    // Type/Reason/Detailed-reason for an EXIT row (the header mislabels them).
    // MASTER/Pradeep label geography explicitly, so prefer that.
    const L = row.length;
    const tail3 = L >= idx.access + 5 ? [clean(row[L - 3]), clean(row[L - 2]), clean(row[L - 1])] : null;
    if (idx.empState >= 0) {
      mergeField(rec, "empState", get(row, "empState"));
      mergeField(rec, "empDistrict", get(row, "empDistrict"));
      mergeField(rec, "empCity", get(row, "empCity"));
    } else if (tail3 && isExitRow) {
      if (tail3[0]) mergeField(rec, "typeOfExit", tail3[0]);
      if (tail3[1]) mergeField(rec, "reasonForExit", tail3[1]);
      if (tail3[2]) mergeField(rec, "detailedReason", tail3[2]);
    } else if (tail3) {
      if (looksGeo(tail3[0])) mergeField(rec, "empState", tail3[0]);
      if (looksGeo(tail3[1])) mergeField(rec, "empDistrict", tail3[1]);
      if (looksGeo(tail3[2])) mergeField(rec, "empCity", tail3[2]);
    }

    // remarks (skip the bare "exit" marker / geography)
    const rem = get(row, "remarks");
    if (rem && rem.toLowerCase() !== "exit" && !looksGeoState(rem)) mergeField(rec, "remarks", rem);

    people.set(id, rec);
  }
}

// EXIT.csv — columns are shifted in the tail, so scan heuristically: a parseable
// date is the exit date; the longest free-text cell is the reason.
{
  const file = path.join(DIR_A, "EXIT.csv");
  if (existsSync(file)) {
    const rows = parseCsv(file);
    const idx = rosterIndex(rows[0]);
    const get = (row, field) => (idx[field] >= 0 ? clean(row[idx[field]]) : "");
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => clean(c) === "")) continue;
      const name = get(row, "name");
      if (!name) continue;
      const nkey = norm(name);
      let id = empIdOf(idx.employeeId >= 0 ? row[idx.employeeId] : "") || nameIndex.get(nkey) || `TMP-${++synthSeq}`;
      if (!nameIndex.has(nkey)) nameIndex.set(nkey, id);
      const rec = people.get(id) || { empId: id, _synthetic: id.startsWith("TMP-") };
      if (!rec.name) rec.name = name;
      rec.isExit = true;
      mergeField(rec, "department", get(row, "department"));
      mergeField(rec, "capabilityManager", get(row, "capabilityManager"));
      mergeField(rec, "designation", get(row, "designation"));
      mergeField(rec, "contribution", get(row, "contribution"));
      const mail = get(row, "mail").toLowerCase();
      if (!rec.email && isEmail(mail)) rec.email = mail;
      // scan the (column-shifted) row for an exit date + the free-text reason
      // cells, then split into Type / short Reason / detailed Reason.
      let bestDate = null;
      const TITLE = /(instructor|\bsdi\b|\bsdft\b|\bsdm\b|\bsdf\b|trainer|capability manager|program manager|project manager|\bengineer\b|analyst|\bset\b|\bhod\b|\bboa\b|^other$|nxtwave|university|work from home)/i;
      // word-order-insensitive name key (CM names appear reordered across files)
      const tokKey = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean).sort().join("");
      const cmTok = tokKey(get(row, "capabilityManager"));
      // exclude emails, UIDs, dept/niat/geo/titles, names, and known
      // contribution/region tokens — only real free-text exit notes remain.
      const STOP = new Set(["central","academy","intensive","work from home","telugu","hindi","tamil","kannada","marathi","bengali","malayalam","english"]);
      const notReason = (c) => isEmail(c) || /^[0-9a-f]{8}-/i.test(c) ||
        /^instructors\s*-/i.test(c) || /^niat\b/i.test(c) || looksGeoState(c) || TITLE.test(c) ||
        norm(c) === nkey || /^(nw|tmp|nwx)[-0-9]/i.test(c) || nameIndex.has(norm(c)) ||
        STOP.has(c.toLowerCase()) || (cmTok && tokKey(c) === cmTok);
      // Exit notes live in the row's tail (after the access column); scanning
      // only there avoids the leading identity/contribution/manager columns.
      const tail = row.slice(idx.access >= 0 ? idx.access + 1 : 20);
      const cands = [];
      for (const cell of tail) {
        const c = clean(cell);
        if (!c) continue;
        const d = parseDate(c);
        if (d) { if (!bestDate) bestDate = d; continue; }
        if (c.length > 4 && !notReason(c)) cands.push(c);
      }
      if (bestDate) mergeField(rec, "exitDate", bestDate);
      // A short label that names an exit category is the "Type"; long narrative
      // text is the "Detailed reason".
      const TYPE_RE = /(self[\s-]*raised|terminat|abscond|resign|notice period|served notice|\bpip\b|involuntary|voluntary|asked to leave|let go|end of contract|higher stud)/i;
      const typeCand = cands.find((c) => c.length < 45 && TYPE_RE.test(c));
      if (typeCand) mergeField(rec, "typeOfExit", typeCand);
      const rest = cands.filter((c) => c !== typeCand);
      if (rest.length) {
        const longest = rest.reduce((a, b) => (b.length > a.length ? b : a));
        mergeField(rec, "detailedReason", longest);
        const shortest = rest.reduce((a, b) => (b.length < a.length ? b : a));
        if (shortest !== longest) mergeField(rec, "reasonForExit", shortest);
      }
      people.set(id, rec);
    }
  }
}

// ---- 2. role assignment by tree depth -------------------------------------
const STUB_NAMES = { NW0000001: "Rahul Attuluri" };
// A person is a manager if someone reports to them OR their job title says so
// (some Capability Managers' reportees are attributed to a peer in the source).
const isManager = new Set();
for (const p of people.values()) if (p.managerEmpId) isManager.add(p.managerEmpId);
for (const p of people.values()) if (/capability manager/i.test(p.designation || "")) isManager.add(p.empId);

// A manager who manages at least one other manager = SENIOR_MANAGER.
const managesAManager = new Set();
for (const p of people.values()) {
  if (p.managerEmpId && isManager.has(p.empId)) managesAManager.add(p.managerEmpId);
}
function roleOf(p) {
  if (!isManager.has(p.empId)) return "INSTRUCTOR";
  if (managesAManager.has(p.empId)) return "SENIOR_MANAGER";
  return "CAPABILITY_MANAGER";
}
// Managers referenced but with no own row (e.g. Rahul Attuluri) → create stub SM.
for (const mgrId of [...isManager]) {
  if (!people.has(mgrId)) {
    people.set(mgrId, { empId: mgrId, name: STUB_NAMES[mgrId] || mgrId, _stub: true, managerEmpId: null });
    managesAManager.add(mgrId); // top of a chain → treat as SM
  }
}

// ---- 3. connect + wipe -----------------------------------------------------
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
console.log("Connected. DB:", mongoose.connection.name);
const admin0 = await User.findOne({ role: "OPS_ADMIN" }).lean();
await Instructor.deleteMany({});
await User.deleteMany({ role: { $ne: "OPS_ADMIN" } });

// ---- 4. ensure dynamic field catalog --------------------------------------
const NEW_FIELDS = [
  { key: "designation", label: "Designation / Title", module: "HIRING", type: "TEXT", visibility: "PUBLIC" },
  { key: "department", label: "Department", module: "DEPLOYMENT", type: "TEXT", visibility: "PUBLIC" },
  { key: "contribution", label: "Contribution", module: "DEPLOYMENT", type: "TEXT", visibility: "NECESSARY" },
  { key: "contribution_region", label: "Contribution Region", module: "DEPLOYMENT", type: "TEXT", visibility: "PUBLIC" },
  { key: "reporting_manager", label: "Reporting Manager (Darwin)", module: "DEPLOYMENT", type: "TEXT", visibility: "NECESSARY" },
  { key: "payroll_entity", label: "Payroll Entity", module: "HIRING", type: "TEXT", visibility: "NECESSARY" },
  { key: "university_mail", label: "University Mail", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "gender", label: "Gender", module: "PERSONAL", type: "TEXT", visibility: "PUBLIC" },
  { key: "native_language", label: "Native Language", module: "PERSONAL", type: "TEXT", visibility: "PUBLIC" },
  { key: "access_status", label: "Portal / Assets / Drive Access", module: "DEPLOYMENT", type: "TEXT", visibility: "NECESSARY" },
  { key: "emp_state", label: "State", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "emp_district", label: "District", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "emp_city", label: "City", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "workspace", label: "Workspace / Seat", module: "DEPLOYMENT", type: "TEXT", visibility: "PUBLIC" },
  { key: "remarks", label: "Remarks", module: "PERFORMANCE", type: "TEXT", visibility: "NECESSARY" },
  // training
  { key: "secondary_track", label: "Secondary Track", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "ongoing_track", label: "Ongoing Track", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "ongoing_start", label: "Ongoing Track Start", module: "TRAINING", type: "DATE", visibility: "NECESSARY" },
  { key: "secondary_pct", label: "Secondary % Done", module: "TRAINING", type: "NUMBER", visibility: "NECESSARY" },
  { key: "health_status", label: "Health Status", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "predicted_completion", label: "Predicted Completion", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "reporting_day", label: "Reporting Day", module: "TRAINING", type: "TEXT", visibility: "PUBLIC" },
  { key: "working_status", label: "Working Status", module: "DEPLOYMENT", type: "TEXT", visibility: "PUBLIC" },
  { key: "sem1", label: "Semester 1", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "sem2", label: "Semester 2", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "other_learnings", label: "Other Learnings", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
  { key: "training_remarks", label: "Training Remarks", module: "TRAINING", type: "TEXT", visibility: "NECESSARY" },
];
const existingKeys = new Set((await FieldDefinition.find().select("key").lean()).map((f) => f.key));
const toCreate = NEW_FIELDS.filter((f) => !existingKeys.has(f.key));
for (const f of toCreate) await FieldDefinition.create({ ...f, scope: "GLOBAL", createdById: admin0?._id });
console.log(`Field catalog: +${toCreate.length} new (kept ${existingKeys.size}).`);

// ---- 5. create manager Users (SM then CM), build empId -> userId -----------
const DEAD_HASH = bcrypt.hashSync("set-via-email-" + Math.random().toString(36).slice(2), 10);
const userIdByEmp = new Map();
const usedEmails = new Set((await User.find().select("email").lean()).map((u) => u.email));

function emailFor(p) {
  if (p.email) return p.email;
  if (p.universityMail) return p.universityMail;
  const base = slug(p.name) || ("user" + p.empId.toLowerCase());
  let e = `${base}@niat.faculty`, n = 1;
  while (usedEmails.has(e)) e = `${base}${++n}@niat.faculty`;
  return e;
}

const managerPeople = [...people.values()].filter((p) => roleOf(p) !== "INSTRUCTOR");
// senior managers first (so CM.managerId can resolve), then CMs
for (const role of ["SENIOR_MANAGER", "CAPABILITY_MANAGER"]) {
  for (const p of managerPeople) {
    if (roleOf(p) !== role) continue;
    let email = emailFor(p);
    if (usedEmails.has(email)) { // already a user with this email (e.g. ops admin) → reuse
      const u = await User.findOne({ email }).select("_id").lean();
      if (u) { userIdByEmp.set(p.empId, u._id); continue; }
    }
    usedEmails.add(email);
    const u = await User.create({
      email, name: p.name, passwordHash: DEAD_HASH, role,
      active: true, managerId: null, // linked in second pass
      mustSetPassword: true, // set their own password via emailed link
    });
    userIdByEmp.set(p.empId, u._id);
  }
}
// link manager → manager
for (const p of managerPeople) {
  const uid = userIdByEmp.get(p.empId);
  const mid = p.managerEmpId ? userIdByEmp.get(p.managerEmpId) : null;
  if (uid && mid) await User.updateOne({ _id: uid }, { $set: { managerId: mid } });
}
const smCount = managerPeople.filter((p) => roleOf(p) === "SENIOR_MANAGER").length;
const cmCount = managerPeople.filter((p) => roleOf(p) === "CAPABILITY_MANAGER").length;
console.log(`Managers: ${smCount} Senior Managers, ${cmCount} Capability Managers.`);

// ---- 6. training overlay from track sheets --------------------------------
const META = new Set([
  "employeeid", "name", "department", "capabilitymanager", "primarytrack", "secondarytrack",
  "ongoingtrack", "ongoingtrackstartdate", "ongoingtrackdeadline", "primarydone", "primarypctdone",
  "healthstatus", "predictedcompletion", "secondarydone", "secondarypctdone", "sem1", "sem2",
  "reportingday", "otherlearnings", "remarks", "workingstatus", "",
]);
const training = new Map(); // empId -> { fields, skills }
const TRACK_FILES = [
  { f: "ENGLISH.csv", moduleRow: 0 },
  { f: "MDATA.csv", moduleRow: -1 },
  { f: "Mathematical&Aptitude.csv", moduleRow: 0 },
  { f: "TECH.csv", moduleRow: 1 },
];
for (const { f, moduleRow } of TRACK_FILES) {
  const file = path.join(DIR_B, f);
  if (!existsSync(file)) { console.warn("  (missing track)", f); continue; }
  const rows = parseCsv(file);
  if (rows.length < 2) continue;
  const head0 = rows[0].map(norm);
  const dataStart = moduleRow === 1 ? 2 : 1;
  const colName = (i) => (moduleRow >= 0 ? norm(rows[moduleRow][i] || "") : "");
  const find = (alias) => head0.findIndex((h) => alias.includes(h));
  const ci = {
    emp: find(["employeeid"]),
    ptrack: find(["primarytrack"]),
    strack: find(["secondarytrack"]),
    otrack: find(["ongoingtrack"]),
    ostart: find(["ongoingtrackstartdate"]),
    odead: find(["ongoingtrackdeadline"]),
    ppct: head0.findIndex((h, i) => (h === "primarydone" || h === "primarypctdone") && i > 5),
    health: head0.indexOf("healthstatus"),
    pred: head0.indexOf("predictedcompletion"),
    spct: head0.lastIndexOf("secondarydone") >= 0 ? head0.lastIndexOf("secondarydone") : head0.lastIndexOf("secondarypctdone"),
    rday: head0.indexOf("reportingday"),
    wstatus: find(["workingstatus"]),
    sem1: head0.indexOf("sem1"),
    sem2: head0.indexOf("sem2"),
    other: head0.indexOf("otherlearnings"),
    tremarks: head0.indexOf("remarks"),
  };
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const id = empIdOf(ci.emp >= 0 ? row[ci.emp] : "");
    if (!id) continue;
    const t = training.get(id) || { fields: {}, skills: {}, modules: {} };
    const set = (k, v) => { const c = clean(v); if (c && !t.fields[k]) t.fields[k] = c; };
    if (ci.ptrack >= 0) set("primary_track", row[ci.ptrack]);
    if (ci.strack >= 0) set("secondary_track", row[ci.strack]);
    if (ci.otrack >= 0) set("ongoing_track", row[ci.otrack]);
    if (ci.ostart >= 0) { const d = parseDate(row[ci.ostart]); if (d) set("ongoing_start", d); }
    if (ci.odead >= 0) { const d = parseDate(row[ci.odead]); if (d) set("track_deadline", d); }
    if (ci.ppct >= 0) { const p = pct(row[ci.ppct]); if (p != null) set("primary_pct", p); }
    if (ci.spct >= 0) { const p = pct(row[ci.spct]); if (p != null) set("secondary_pct", p); }
    if (ci.health >= 0) set("health_status", row[ci.health]);
    if (ci.pred >= 0) set("predicted_completion", row[ci.pred]);
    if (ci.rday >= 0) set("reporting_day", row[ci.rday]);
    if (ci.wstatus >= 0) set("working_status", row[ci.wstatus]);
    if (ci.sem1 >= 0) set("sem1", row[ci.sem1]);
    if (ci.sem2 >= 0) set("sem2", row[ci.sem2]);
    if (ci.other >= 0) set("other_learnings", row[ci.other]);
    if (ci.tremarks >= 0) { const rm = clean(row[ci.tremarks]); if (rm && rm.toLowerCase() !== "exit") set("training_remarks", rm); }
    // per-module status: store the full state, and mark completed ones as skills
    if (moduleRow >= 0) {
      for (let i = 0; i < row.length; i++) {
        const nm = colName(i);
        if (!nm || META.has(nm)) continue;
        const human = (rows[moduleRow][i] || "").trim();
        if (!human) continue;
        const cell = clean(row[i]);
        if (!cell) continue;
        if (!t.modules[human]) t.modules[human] = cell;
        if (/completed/i.test(cell)) t.skills[human] = true;
      }
    }
    training.set(id, t);
  }
}

// ---- 7. create Instructor profiles ----------------------------------------
function lifecycleOf(p, t) {
  if (p.isExit) return "EXITED";
  const pp = Number(t?.fields?.primary_pct || 0);
  if (pp >= 100) return "CONFIRMED";
  if (pp > 0) return "IN_TRAINING";
  return "ONBOARDING";
}
const instructorPeople = [...people.values()].filter((p) => roleOf(p) === "INSTRUCTOR" && !p._stub);
const instrDocs = [];
const instrUserDocs = [];
for (const p of instructorPeople) {
  const t = training.get(p.empId);
  const status = lifecycleOf(p, t);
  const values = {};
  const V = (k, v) => { const c = clean(v); if (c) values[k] = c; };
  V("designation", p.designation); V("department", p.department);
  V("contribution", p.contribution); V("contribution_region", p.contributionRegion);
  V("reporting_manager", p.reportingManager); V("payroll_entity", p.payrollEntity);
  V("phone", p.phone); V("qualification", p.qualification); V("domain", p.domain);
  V("doj", p.doj); V("university_mail", p.universityMail); V("gender", p.gender);
  V("native_language", p.nativeLanguage); V("access_status", p.access);
  V("emp_state", p.empState); V("emp_district", p.empDistrict); V("emp_city", p.empCity);
  V("workspace", p.workspace); V("remarks", p.remarks);
  if (t) for (const [k, v] of Object.entries(t.fields)) V(k, v);

  const mgrUserId = p.managerEmpId ? userIdByEmp.get(p.managerEmpId) || null : null;
  const empId = p._synthetic ? `NWX-${slug(p.name)}-${p.empId.replace("TMP-", "")}` : p.empId;

  instrDocs.push({
    employeeId: empId,
    uid: p.uid || null,
    name: p.name,
    email: p.email || null,
    campus: p.workLocation || null,
    status,
    currentManagerId: mgrUserId,
    assignments: mgrUserId ? [{ managerId: mgrUserId, assignedById: admin0?._id }] : [],
    values,
    skills: t?.skills || {},
    moduleStatus: t?.modules || {},
    exit: p.isExit ? {
      lastWorkingDay: p.exitDate || null, typeOfExit: p.typeOfExit || null,
      reason: p.reasonForExit || null, detailedReason: p.detailedReason || null, items: {},
    } : undefined,
    lifecycle: [{ status, note: "Imported from NIAT master data", actorId: admin0?._id, actorName: admin0?.name || "System" }],
  });

  // instructor login (only with a real, unique email)
  if (p.email && isEmail(p.email) && !usedEmails.has(p.email)) {
    usedEmails.add(p.email);
    instrUserDocs.push({ email: p.email, name: p.name, passwordHash: DEAD_HASH, role: "INSTRUCTOR", active: true, managerId: mgrUserId, mustSetPassword: true });
  }
}

// employeeId uniqueness safety net
const seenEmp = new Set();
for (const d of instrDocs) { let id = d.employeeId, n = 1; while (seenEmp.has(id)) id = `${d.employeeId}-${++n}`; d.employeeId = id; seenEmp.add(id); }

const insertedInstr = await Instructor.insertMany(instrDocs, { ordered: false });
if (instrUserDocs.length) await User.insertMany(instrUserDocs, { ordered: false });

await AuditLog.insertMany(insertedInstr.map((inst) => ({
  instructorId: inst._id, instructorName: inst.name, actorId: admin0?._id,
  actorName: admin0?.name || "System", actorRole: "OPS_ADMIN",
  action: "INSTRUCTOR_CREATE", reason: "NIAT master import", newValue: inst.employeeId,
})));

// ---- 8. summary ------------------------------------------------------------
const [ops, sm, cm, instr, withMgr, exited, withEmail, instrLogins] = await Promise.all([
  User.countDocuments({ role: "OPS_ADMIN" }),
  User.countDocuments({ role: "SENIOR_MANAGER" }),
  User.countDocuments({ role: "CAPABILITY_MANAGER" }),
  Instructor.countDocuments(),
  Instructor.countDocuments({ currentManagerId: { $ne: null } }),
  Instructor.countDocuments({ status: "EXITED" }),
  Instructor.countDocuments({ email: { $ne: null } }),
  User.countDocuments({ role: "INSTRUCTOR" }),
]);
console.log("\n✅ Import complete.");
console.log(`   Ops Admins (kept)     : ${ops}`);
console.log(`   Senior Managers       : ${sm}`);
console.log(`   Capability Managers   : ${cm}`);
console.log(`   Instructors           : ${instr}  (assigned to a manager: ${withMgr}, exited: ${exited}, with email: ${withEmail})`);
console.log(`   Instructor logins      : ${instrLogins}`);
console.log(`   Unassigned (no manager): ${instr - withMgr}`);

await mongoose.disconnect();
process.exit(0);
