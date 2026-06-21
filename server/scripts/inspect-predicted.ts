/* Read-only: report the distinct formats/values in predicted_completion + secondary_predicted_completion. */
import { connectDB, disconnectDB } from "../src/db";
import { Instructor } from "../src/models";

const KEYS = ["predicted_completion", "secondary_predicted_completion"];

// Classify a raw value into a bucket so we can see the spread of formats.
function classify(v: any): string {
  if (v === undefined || v === null || String(v).trim() === "") return "(empty)";
  const s = String(v).trim();
  if (/^#(VALUE|REF|N\/?A|NAME|DIV|NUM|NULL)/i.test(s)) return "spreadsheet-error";
  if (/^completed$/i.test(s)) return "text:Completed";
  if (/^n\/?a$/i.test(s)) return "text:N/A";
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(s)) return "date:DD-Mon-YYYY";       // 26-Jun-2026
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "date:ISO";                       // 2026-06-26
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return "date:slash";           // 25/05/2026
  if (!isNaN(Date.parse(s))) return "date:other-parseable";
  return "other-text";
}

async function main() {
  await connectDB();
  const docs = await Instructor.find({}).select("employeeId values").lean();
  console.log(`Instructors: ${docs.length}`);
  for (const key of KEYS) {
    const buckets: Record<string, number> = {};
    const samples: Record<string, string[]> = {};
    for (const d of docs as any[]) {
      const v = d.values?.[key];
      const b = classify(v);
      buckets[b] = (buckets[b] || 0) + 1;
      if (b !== "(empty)") { (samples[b] ||= []); if (samples[b].length < 6) samples[b].push(`${d.employeeId}="${v}"`); }
    }
    console.log(`\n=== ${key} ===`);
    for (const b of Object.keys(buckets).sort()) {
      console.log(`  ${b.padEnd(22)} ${String(buckets[b]).padStart(5)}   ${(samples[b] || []).join("  ")}`);
    }
  }
  await disconnectDB();
}
main().catch((e) => { console.error(e); process.exit(1); });
