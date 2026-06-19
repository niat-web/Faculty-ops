// Back up every collection to timestamped JSON files under ./backups/.
// Schedule this with your host's cron (daily) for automated backups.
//
//   npm run backup
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import mongoose from "mongoose";

try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set in .env"); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join(process.cwd(), "backups", stamp);
mkdirSync(dir, { recursive: true });

const collections = await db.listCollections().toArray();
let total = 0;
for (const c of collections) {
  const docs = await db.collection(c.name).find({}).toArray();
  writeFileSync(path.join(dir, `${c.name}.json`), JSON.stringify(docs, null, 2));
  console.log(`  ${c.name}: ${docs.length} docs`);
  total += docs.length;
}
console.log(`\n✅ Backup complete → backups/${stamp}  (${total} documents across ${collections.length} collections)`);
await mongoose.disconnect();
process.exit(0);
