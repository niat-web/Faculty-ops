// READ-ONLY audit: where (if anywhere) is the TECH/English/Aptitude module data stored?
import mongoose from "mongoose";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const uri = env.match(/^MONGODB_URI=(.+)$/m)[1].trim();

await mongoose.connect(uri);
const db = mongoose.connection.db;
const I = db.collection("instructors");

const line = (s = "") => console.log(s);

// 1) Field definitions (the 42)
const defs = await db.collection("fielddefinitions")
  .find({}).project({ label: 1, key: 1, module: 1, archivedAt: 1 }).toArray();
line(`\n=== FIELD DEFINITIONS (${defs.length}) ===`);
const byMod = {};
for (const d of defs) (byMod[d.module] ||= []).push(`${d.label} [${d.key}]${d.archivedAt ? " (archived)" : ""}`);
for (const [m, arr] of Object.entries(byMod)) line(`  ${m}: ${arr.join(", ")}`);

// 2) Map fill counts
const total = await I.countDocuments();
const nonEmpty = (f) => I.countDocuments({
  $expr: { $gt: [{ $size: { $objectToArray: { $ifNull: ["$" + f, {}] } } }, 0] },
});
line(`\n=== MAP FILL (of ${total} instructors) ===`);
line(`  values populated:        ${await nonEmpty("values")}`);
line(`  skills populated:        ${await nonEmpty("skills")}`);
line(`  moduleStatus populated:  ${await nonEmpty("moduleStatus")}`);

// 3) Which keys actually exist in each Map (frequency)
const keyFreq = async (f) => I.aggregate([
  { $project: { kv: { $objectToArray: { $ifNull: ["$" + f, {}] } } } },
  { $unwind: "$kv" }, { $group: { _id: "$kv.k", n: { $sum: 1 } } },
  { $sort: { n: -1 } }, { $limit: 60 },
]).toArray();
for (const f of ["values", "skills", "moduleStatus"]) {
  const rows = await keyFreq(f);
  line(`\n=== KEYS IN \`${f}\` (top ${rows.length}) ===`);
  if (!rows.length) line("  (none)");
  for (const r of rows) line(`  ${r._id} — ${r.n}`);
}

// 4) Sample instructors that clearly have training data in the sheet
line(`\n=== SAMPLES ===`);
for (const eid of ["NW0004483", "NW0004096", "NW0003995", "NW0005643"]) {
  const doc = await I.findOne({ employeeId: eid });
  if (!doc) { line(`  ${eid}: NOT FOUND`); continue; }
  const vk = Object.keys(doc.values || {});
  const sk = Object.keys(doc.skills || {});
  const mk = Object.keys(doc.moduleStatus || {});
  line(`  ${eid} ${doc.name}`);
  line(`    values(${vk.length}): ${vk.join(", ") || "—"}`);
  line(`    skills(${sk.length}): ${sk.slice(0, 8).join(", ") || "—"}`);
  line(`    moduleStatus(${mk.length}): ${mk.slice(0, 8).join(", ") || "—"}`);
}

await mongoose.disconnect();
