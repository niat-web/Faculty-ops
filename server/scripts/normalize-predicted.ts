/* Normalize predicted_completion + secondary_predicted_completion to ONE format.
   - parseable date            → "DD-Mon-YYYY" (e.g. 26-Jun-2026)
   - spreadsheet error (#...)  → "N/A"
   - "completed"/"n/a"         → "Completed" / "N/A" (canonical casing)
   - any other text            → kept as-is
   - empty                     → left empty
   Touches ONLY these two keys. Run with `--apply` to write; otherwise dry-run.       */
import { connectDB, disconnectDB } from "../src/db";
import { Instructor } from "../src/models";

const KEYS = ["predicted_completion", "secondary_predicted_completion"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const APPLY = process.argv.includes("--apply");

function normalize(raw: any): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (s === "") return "";
  if (/^#(VALUE|REF|N\/?A|NAME|DIV|NUM|NULL)/i.test(s)) return "N/A";
  if (/^completed$/i.test(s)) return "Completed";
  if (/^n\/?a$/i.test(s)) return "N/A";
  // try to parse a date (handle "26-Jun-2026" by turning dashes into spaces too)
  let d = new Date(s);
  if (isNaN(d.getTime())) d = new Date(s.replace(/-/g, " "));
  if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
  return s; // unknown text → keep verbatim
}

async function main() {
  await connectDB();
  const docs = await Instructor.find({}).select("employeeId values").lean();
  let changedDocs = 0, changedCells = 0;
  const ops: any[] = [];
  const samples: string[] = [];
  for (const d of docs as any[]) {
    const set: Record<string, string> = {};
    for (const key of KEYS) {
      const cur = d.values?.[key];
      const curStr = cur === undefined || cur === null ? "" : String(cur);
      const next = normalize(cur);
      if (next !== curStr) {
        set[`values.${key}`] = next;
        changedCells++;
        if (samples.length < 25) samples.push(`${d.employeeId} ${key}: "${curStr}" → "${next}"`);
      }
    }
    if (Object.keys(set).length) { changedDocs++; ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } }); }
  }
  console.log(`Scanned ${docs.length} instructors. ${changedCells} cell(s) across ${changedDocs} instructor(s) need normalizing.`);
  console.log("Sample changes:\n  " + (samples.join("\n  ") || "(none)"));
  if (APPLY && ops.length) {
    const r = await Instructor.bulkWrite(ops, { ordered: false });
    console.log(`APPLIED. modified=${(r as any).modifiedCount}`);
  } else if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to write these changes.");
  }
  await disconnectDB();
}
main().catch((e) => { console.error(e); process.exit(1); });
