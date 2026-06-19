// Create / reset a super-admin (Ops Admin) in the configured MongoDB, and build
// all indexes for fast queries. Non-destructive: it does NOT touch existing data.
//
//   npm run create-admin
//
// Override the credentials via env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME.
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// minimal .env loader (no extra dependency)
try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set in .env"); process.exit(1); }

const EMAIL = (process.env.ADMIN_EMAIL || "superadmin@crm.com").toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";
const NAME = process.env.ADMIN_NAME || "Super Admin";

console.log("Connecting to MongoDB…");
await mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 20000 });
console.log("Connected. DB:", mongoose.connection.name);

const dir = path.dirname(fileURLToPath(import.meta.url));
const models = await import(pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href);
const { User, Instructor, FieldDefinition, EditRequest, AuditLog, Notification } = models;

console.log("Building indexes (one-time, makes reads fast)…");
await Promise.all([
  User.syncIndexes(), Instructor.syncIndexes(), FieldDefinition.syncIndexes(),
  EditRequest.syncIndexes(), AuditLog.syncIndexes(), Notification.syncIndexes(),
]);

const passwordHash = bcrypt.hashSync(PASSWORD, 10);
await User.findOneAndUpdate(
  { email: EMAIL },
  { $set: { name: NAME, role: "OPS_ADMIN", active: true, passwordHash } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

const total = await User.countDocuments();
console.log("\n✅ Super admin ready:");
console.log("   Email   :", EMAIL);
console.log("   Password:", PASSWORD);
console.log("   Role    : OPS_ADMIN (full access)");
console.log(`   (users in DB: ${total})`);
console.log("\n⚠️  Change this password after first login in production.");

await mongoose.disconnect();
process.exit(0);
