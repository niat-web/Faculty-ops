// One-off DB migration: copy every collection (docs + indexes) from OLD → NEW cluster.
// Usage:  node migrate-db.mjs "<OLD_URI_with_/instructor_crm>" "<NEW_URI_with_/instructor_crm>"
// Safe to re-run: it clears each target collection before inserting.
// Uses the `mongodb` driver that ships with mongoose (already in node_modules).
import { MongoClient } from "mongodb";

const [, , OLD_URI, NEW_URI] = process.argv;
const DB = "instructor_crm";

if (!OLD_URI || !NEW_URI) {
  console.error('Usage: node migrate-db.mjs "<OLD_URI>" "<NEW_URI>"');
  process.exit(1);
}

const oldClient = new MongoClient(OLD_URI);
const newClient = new MongoClient(NEW_URI);

try {
  await oldClient.connect();
  await newClient.connect();
  console.log("[migrate] connected to both clusters");

  const src = oldClient.db(DB);
  const dst = newClient.db(DB);
  const cols = (await src.listCollections().toArray()).filter((c) => !c.name.startsWith("system."));
  console.log(`[migrate] ${cols.length} collections to copy\n`);

  let totalDocs = 0;
  for (const { name } of cols) {
    const docs = await src.collection(name).find({}).toArray();
    await dst.collection(name).deleteMany({}); // make the run idempotent
    if (docs.length) await dst.collection(name).insertMany(docs, { ordered: false });
    totalDocs += docs.length;

    // Recreate non-default indexes (preserves the unique email/partial indexes etc.)
    const indexes = await src.collection(name).indexes();
    for (const ix of indexes) {
      if (ix.name === "_id_") continue;
      const { v, key, name: idxName, background, ns, ...opts } = ix;
      try { await dst.collection(name).createIndex(key, { name: idxName, ...opts }); }
      catch (e) { console.warn(`  ! index ${idxName} on ${name}: ${e.message}`); }
    }
    console.log(`  ✓ ${name.padEnd(20)} ${docs.length} docs`);
  }

  console.log(`\n[migrate] DONE — copied ${totalDocs} documents across ${cols.length} collections.`);
} catch (e) {
  console.error("[migrate] FAILED:", e.message);
  process.exit(1);
} finally {
  await oldClient.close().catch(() => {});
  await newClient.close().catch(() => {});
}
