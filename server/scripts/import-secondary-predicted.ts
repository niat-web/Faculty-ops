/* Import secondary_predicted_completion from the source CSVs (TECH + Math&Aptitude; English has none).
   Reads the 2nd "Predicted Completion" column by position, matches by Employee ID, normalizes the value.
   Touches ONLY values.secondary_predicted_completion. Dry-run unless --apply.                         */
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { connectDB, disconnectDB } from "../src/db";
import { Instructor } from "../src/models";

const DIR = process.env.CSV_DIR || "/c/Users/NxtWave/Downloads/drive-download-20260618T074354Z-3-001";
const FILES = ["TECH.csv", "Mathematical&Aptitude.csv"]; // English intentionally excluded (no secondary track)
const APPLY = process.argv.includes("--apply");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function normalize(raw: any): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (s === "") return "";
  if (/^#(VALUE|REF|N\/?A|NAME|DIV|NUM|NULL)/i.test(s)) return "N/A";
  if (/^completed$/i.test(s)) return "Completed";
  if (/^n\/?a$/i.test(s)) return "N/A";
  let d = new Date(s); if (isNaN(d.getTime())) d = new Date(s.replace(/-/g, " "));
  if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
  return s;
}

async function main() {
  await connectDB();
  // Map every CSV row's Employee ID → normalized secondary predicted value.
  const want = new Map<string, { value: string; file: string }>();
  for (const f of FILES) {
    const full = path.join(DIR, f);
    const rows = (Papa.parse(fs.readFileSync(full, "utf8"), { skipEmptyLines: false }).data as string[][]);
    const hdr = rows.findIndex((r) => r.some((c) => String(c).trim() === "Predicted Completion"));
    const header = rows[hdr];
    const empIdx = header.findIndex((c) => String(c).trim() === "Employee ID");
    const predIdxs = header.map((c, i) => (String(c).trim() === "Predicted Completion" ? i : -1)).filter((i) => i >= 0);
    if (predIdxs.length < 2) { console.log(`${f}: no secondary Predicted Completion column — skipped.`); continue; }
    const secIdx = predIdxs[1];
    let count = 0;
    for (let i = hdr + 1; i < rows.length; i++) {
      const emp = String(rows[i][empIdx] || "").trim();
      if (!/^NW/i.test(emp)) continue; // skip header-2 / blank-id rows
      want.set(emp, { value: normalize(rows[i][secIdx]), file: f });
      count++;
    }
    console.log(`${f}: secondary col index ${secIdx}, ${count} data rows.`);
  }

  // Apply to DB.
  let toSet = 0, unmatched = 0, blank = 0;
  const ops: any[] = []; const samples: string[] = [];
  for (const [emp, { value }] of want) {
    const doc = await Instructor.findOne({ employeeId: emp }).select("_id values").lean() as any;
    if (!doc) { unmatched++; continue; }
    if (!value) { blank++; continue; } // nothing meaningful to add
    const cur = doc.values?.secondary_predicted_completion;
    const curStr = cur == null ? "" : String(cur);
    if (curStr === value) continue;
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { "values.secondary_predicted_completion": value } } } });
    toSet++;
    if (samples.length < 20) samples.push(`${emp}: "${curStr}" → "${value}"`);
  }
  console.log(`\nWill set ${toSet} secondary value(s). (unmatched-in-DB: ${unmatched}, blank-in-CSV: ${blank})`);
  console.log("Samples:\n  " + (samples.join("\n  ") || "(none)"));
  if (APPLY && ops.length) { const r = await Instructor.bulkWrite(ops, { ordered: false }); console.log(`APPLIED. modified=${(r as any).modifiedCount}`); }
  else if (!APPLY) console.log("\nDRY RUN — re-run with --apply to write.");
  await disconnectDB();
}
main().catch((e) => { console.error(e); process.exit(1); });
