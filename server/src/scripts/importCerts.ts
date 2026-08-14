/* eslint-disable no-console */
// One-off importer: load the old Google-Form "Certificates" CSV into MongoDB Certifications,
// but ONLY for rows whose Employee ID exactly matches a real employee in our Darwinbox mirror
// (DarwinboxEmployee) — falling back to the Instructor collection. Rows with a blank / "NA" /
// unmatched Employee ID are SKIPPED and reported, never guessed.
//
//   DRY RUN (default):  npx tsx src/scripts/importCerts.ts
//   REAL WRITE:         npx tsx src/scripts/importCerts.ts --write
import fs from "fs";
import mongoose from "mongoose";
import { config } from "../config";
import { Certification, DarwinboxEmployee, Instructor } from "../models";

const CSV_PATH = process.env.CERT_CSV || "C:/Users/NxtWave/Downloads/Certificates - Sheet1.csv";
const WRITE = process.argv.includes("--write");

// ── Minimal RFC-4180 CSV parser (handles quoted fields with commas + newlines) ──
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Best-effort fix for the mojibake in the export (Masterâ€™s → Master's, "No â€" I have" → "No - I have").
function fixText(s: string): string {
  return String(s ?? "")
    .replace(/\u00e2\u20ac\u2122|â€™/g, "'")
    .replace(/\u00e2\u20ac\u0153|â€œ/g, '"')
    .replace(/\u00e2\u20ac\u009d|â€\x9d|â€/g, '"')
    .replace(/\u00e2\u20ac\u201c|â€“|â€”/g, "-")
    .replace(/(\w)â(\w)/g, "$1'$2")
    .replace(/ â /g, " - ")
    .replace(/â/g, "'")
    .replace(/Â/g, "")
    .trim();
}

const norm = (s: string) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
// An Employee-ID cell may hold "A / B" (two ids) — return each trimmed candidate.
const idCandidates = (raw: string) => String(raw ?? "").split(/[\/,;]+/).map((x) => x.trim()).filter(Boolean);

async function main() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found at ${CSV_PATH}`);
  await mongoose.connect(config.mongoUri);
  console.log(`Connected. Mode: ${WRITE ? "WRITE" : "DRY RUN"}\n`);

  // Build the set of REAL employee ids (Darwinbox mirror ∪ Instructor), normalized → canonical.
  const canonical = new Map<string, string>();
  const dbx = await DarwinboxEmployee.find({}, { employeeId: 1 }).lean();
  for (const d of dbx as any[]) { const id = String(d.employeeId || "").trim(); if (id) canonical.set(norm(id), id); }
  const insts = await Instructor.find({}, { employeeId: 1 }).lean();
  for (const d of insts as any[]) { const id = String(d.employeeId || "").trim(); if (id && !canonical.has(norm(id))) canonical.set(norm(id), id); }
  console.log(`Darwinbox employees: ${dbx.length}, Instructors: ${insts.length}, unique ids: ${canonical.size}\n`);

  const rows = parseCSV(fs.readFileSync(CSV_PATH, "utf8"));
  const header = rows.shift() || [];
  console.log(`CSV rows (excl header): ${rows.length}\n`);

  // Column positions (fixed order in this export).
  const C = { ts: 0, email: 1, name: 2, empId: 3, dept: 4, cm: 5, degreeType: 6, qual: 7, domain: 8, yop: 9,
    odHave: 10, odExp: 11, cmmHave: 12, cmmExp: 13, pcHave: 14, pcExp: 15, odLink: 16, cmmLink: 17, pcLink: 18, remarks: 19 };

  type Rec = { canon: string; ts: number; fields: Record<string, string> };
  const matchedByEmp = new Map<string, Rec>();      // canonical id → latest record
  const skipped: { row: number; ts: string; name: string; email: string; rawId: string; reason: string }[] = [];
  let matchedRowCount = 0, dupDropped = 0;

  rows.forEach((r, i) => {
    if (!r.length || r.every((x) => !String(x).trim())) return; // blank line
    const get = (idx: number) => fixText(r[idx] || "");
    const rawId = (r[C.empId] || "").trim();
    const name = get(C.name), email = (r[C.email] || "").trim();
    const cands = idCandidates(rawId);
    let canon = "";
    for (const c of cands) { const hit = canonical.get(norm(c)); if (hit) { canon = hit; break; } }

    if (!rawId || /^na$/i.test(rawId)) { skipped.push({ row: i + 2, ts: r[C.ts] || "", name, email, rawId, reason: "No Employee ID (blank/NA)" }); return; }
    if (!canon) { skipped.push({ row: i + 2, ts: r[C.ts] || "", name, email, rawId, reason: "Employee ID not found in Darwinbox" }); return; }

    matchedRowCount++;
    const fields: Record<string, string> = {
      fullName: name, email, department: get(C.dept), capabilityManagerName: get(C.cm),
      degreeType: get(C.degreeType), highestQualification: get(C.qual), domain: get(C.domain), yearOfPassing: get(C.yop),
      odHave: get(C.odHave), odExpected: get(C.odExp), cmmHave: get(C.cmmHave), cmmExpected: get(C.cmmExp),
      pcHave: get(C.pcHave), pcExpected: get(C.pcExp), odLink: (r[C.odLink] || "").trim(), cmmLink: (r[C.cmmLink] || "").trim(),
      pcLink: (r[C.pcLink] || "").trim(), remarks: get(C.remarks),
    };
    const ts = Date.parse(r[C.ts] || "") || 0;
    const prev = matchedByEmp.get(canon);
    if (prev) { dupDropped++; if (ts < prev.ts) return; } // keep the LATEST submission per employee
    matchedByEmp.set(canon, { canon, ts, fields });
  });

  console.log(`Matched rows: ${matchedRowCount}  (unique employees: ${matchedByEmp.size}, duplicate rows dropped: ${dupDropped})`);
  console.log(`Skipped rows: ${skipped.length}\n`);

  if (WRITE) {
    let up = 0;
    for (const rec of matchedByEmp.values()) {
      const answers: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec.fields)) if (String(v).trim()) answers[k] = String(v).trim();
      const set: any = { employeeId: rec.canon, ...rec.fields, answers, source: "csv-import" };
      const when = rec.ts ? new Date(rec.ts) : new Date();
      await Certification.updateOne(
        { employeeId: rec.canon, source: "csv-import" },
        { $set: set, $setOnInsert: { createdAt: when } },
        { upsert: true, timestamps: false }
      );
      up++;
    }
    console.log(`Upserted ${up} certification records.\n`);
  } else {
    console.log("DRY RUN — nothing written. Re-run with --write to upload.\n");
  }

  // Print the SKIPPED table (not uploaded).
  console.log("=== NOT UPLOADED (skipped) ===");
  console.log("Row | Employee ID (raw) | Name | Email | Reason");
  for (const s of skipped) console.log(`${s.row} | ${s.rawId || "(blank)"} | ${s.name} | ${s.email} | ${s.reason}`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
