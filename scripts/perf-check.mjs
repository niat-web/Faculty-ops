// READ-ONLY: measure where MongoDB time actually goes.
import mongoose from "mongoose";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const uri = env.match(/^MONGODB_URI\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");

const ms = (a, b) => `${Math.round(Number(b - a) / 1e6)} ms`;
const t = () => process.hrtime.bigint();

console.log("Cluster host:", uri.match(/@([^/]+)/)?.[1]);

let a = t();
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
console.log("1) connect():            ", ms(a, t()));
const db = mongoose.connection.db;

// Round-trip latency (network to the cluster region) — 3 pings.
for (let i = 1; i <= 3; i++) {
  a = t(); await db.admin().ping(); console.log(`2) ping #${i}:               `, ms(a, t()));
}

a = t();
const n = await db.collection("instructors").countDocuments();
console.log(`3) countDocuments (${n}):  `, ms(a, t()));

a = t();
await db.collection("instructors").findOne({});
console.log("4) findOne (1 doc):       ", ms(a, t()));

// The actual training-page query.
a = t();
const docs = await db.collection("instructors")
  .find({}).project({ employeeId: 1, name: 1, currentManagerId: 1, values: 1, moduleStatus: 1 })
  .toArray();
const dur = ms(a, t());
const bytes = Buffer.byteLength(JSON.stringify(docs));
console.log(`5) training fetch (${docs.length} rows):`, dur, `· payload ~${(bytes / 1024 / 1024).toFixed(2)} MB`);

// list page query (lighter projection, 25 rows)
a = t();
const list = await db.collection("instructors")
  .find({}).project({ employeeId: 1, name: 1, campus: 1, status: 1, currentManagerId: 1, "values.primary_pct": 1 })
  .sort({ employeeId: 1 }).limit(25).toArray();
console.log("5b) list page (25 rows):  ", ms(a, t()), `· got ${list.length}`);

// users collection (login/users page)
a = t();
const uc = await db.collection("users").countDocuments();
console.log(`5c) users count (${uc}):    `, ms(a, t()));

// Try to read cluster tier / build info (often restricted on M0 free tier).
try {
  const bi = await db.admin().buildInfo();
  console.log("6) MongoDB version:       ", bi.version);
} catch (e) { console.log("6) buildInfo: restricted (", e.codeName || e.message, ")"); }
try {
  const ss = await db.admin().serverStatus();
  console.log("   connections in use:    ", ss.connections?.current, "/ available", ss.connections?.available);
} catch { console.log("   serverStatus: restricted (typical on M0 free tier)"); }

await mongoose.disconnect();
