// DESTRUCTIVE reset before importing real data.
// Deletes: all instructors; all SENIOR_MANAGER / CAPABILITY_MANAGER / INSTRUCTOR
// users; and the dependent records that reference them (edit requests,
// notifications, login events, audit log).
// KEEPS: all OPS_ADMIN users, and the dynamic FieldDefinitions (schema).
//
//   npm run reset-data
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

const dir = path.dirname(fileURLToPath(import.meta.url));
const { User, Instructor, EditRequest, Notification, AuditLog, LoginEvent, FieldDefinition } =
  await import(pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
console.log("Connected. DB:", mongoose.connection.name);

const opsBefore = await User.find({ role: "OPS_ADMIN" }).select("email name").lean();
console.log(`\nOps Admins to KEEP (${opsBefore.length}):`);
opsBefore.forEach((o) => console.log("  •", o.email, `(${o.name})`));

const r = {
  instructors: (await Instructor.deleteMany({})).deletedCount,
  users: (await User.deleteMany({ role: { $ne: "OPS_ADMIN" } })).deletedCount,
  editRequests: (await EditRequest.deleteMany({})).deletedCount,
  notifications: (await Notification.deleteMany({})).deletedCount,
  loginEvents: (await LoginEvent.deleteMany({})).deletedCount,
  auditLogs: (await AuditLog.deleteMany({})).deletedCount,
};

const fieldDefs = await FieldDefinition.countDocuments();
const opsAfter = await User.countDocuments({ role: "OPS_ADMIN" });
const usersAfter = await User.countDocuments();
const instrAfter = await Instructor.countDocuments();

console.log("\n🗑️  Deleted:");
console.log(`   instructors        : ${r.instructors}`);
console.log(`   users (non-Ops)    : ${r.users}`);
console.log(`   edit requests      : ${r.editRequests}`);
console.log(`   notifications      : ${r.notifications}`);
console.log(`   login events       : ${r.loginEvents}`);
console.log(`   audit log entries  : ${r.auditLogs}`);
console.log("\n✅ Kept:");
console.log(`   Ops Admin users    : ${opsAfter}`);
console.log(`   Field definitions  : ${fieldDefs} (schema preserved for import)`);
console.log(`\nNow in DB → users: ${usersAfter} (all Ops Admins), instructors: ${instrAfter}.`);
console.log("Ready for your CSV import.");

await mongoose.disconnect();
process.exit(0);
