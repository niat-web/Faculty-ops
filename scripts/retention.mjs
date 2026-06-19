// Data-retention policy for exited instructors (PRD §9.3).
// Reports instructors who exited more than RETENTION_DAYS ago (default 1095 = 3y).
// Dry-run by default; pass --apply to anonymize PII while keeping a compliance
// stub (status, dates) and the audit trail intact.
//
//   npm run retention            (dry run / report)
//   npm run retention -- --apply (anonymize)
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";

try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set in .env"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "1095", 10);
const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const dir = path.dirname(fileURLToPath(import.meta.url));
const { Instructor } = await import(pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href);

// Exited, with last working day (or last update) older than the cutoff.
const candidates = (await Instructor.find({ status: "EXITED" }).lean()).filter((i) => {
  const lwd = i.exit?.lastWorkingDay ? new Date(i.exit.lastWorkingDay) : new Date(i.updatedAt);
  return lwd < cutoff;
});

console.log(`Retention window: ${RETENTION_DAYS} days (cutoff ${cutoff.toISOString().slice(0, 10)})`);
console.log(`Exited instructors past retention: ${candidates.length}`);
candidates.forEach((c) => console.log(`  - ${c.employeeId}  ${c.name}`));

if (!APPLY) {
  console.log("\nDry run. Re-run with `-- --apply` to anonymize these records (PII removed, compliance stub kept).");
} else {
  for (const c of candidates) {
    await Instructor.updateOne({ _id: c._id }, {
      $set: {
        name: `Redacted (${c.employeeId})`, email: null, uid: null,
        values: {}, documents: [], notes: [],
      },
    });
  }
  console.log(`\n✅ Anonymized ${candidates.length} record(s). Status, lifecycle and audit trail preserved.`);
}
await mongoose.disconnect();
process.exit(0);
