// Create one login per role for testing, in the configured MongoDB.
// Non-destructive for users (upserts). Ensures the standard field catalog
// exists and seeds a realistic set of instructors assigned to the test
// Capability Manager so every role has real-looking data to work with.
//
//   npm run create-test-users
//
// The seeded instructors use employee IDs NW10001–NW10006. Remove them before
// go-live (delete instructors with those IDs, and users ending @crm.com except
// the super admin).
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set in .env"); process.exit(1); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const modelsUrl = pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href;
const seedUrl = pathToFileURL(path.join(dir, "..", "src", "lib", "seedData.js")).href;

console.log("Connecting to MongoDB…");
await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 20000 });
console.log("Connected. DB:", mongoose.connection.name);

const { User, Instructor, FieldDefinition, AuditLog } = await import(modelsUrl);
const { FIELD_DEFS } = await import(seedUrl);
const hash = (p) => bcrypt.hashSync(p, 10);

async function upsertUser(email, name, role, password, managerId = null) {
  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { name, role, active: true, passwordHash: hash(password), managerId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// 1) Role logins (real person names; emails are the test credentials)
const admin = await User.findOne({ role: "OPS_ADMIN" }).lean();
const sm = await upsertUser("seniormanager@crm.com", "Rajesh Verma", "SENIOR_MANAGER", "Senior@123");
const cm = await upsertUser("capabilitymanager@crm.com", "Sneha Iyer", "CAPABILITY_MANAGER", "Capability@123", sm._id);
const inst = await upsertUser("instructor@crm.com", "Aarav Sharma", "INSTRUCTOR", "Instructor@123");
const actorId = admin?._id || sm._id;
const actorName = admin?.name || sm.name;

// 2) Ensure the standard field catalog exists
if ((await FieldDefinition.countDocuments()) === 0) {
  for (const d of FIELD_DEFS) await FieldDefinition.create({ ...d, scope: "GLOBAL", createdById: actorId });
  console.log(`Seeded ${FIELD_DEFS.length} standard global fields.`);
}

// 3) Remove the earlier placeholder records
await Instructor.deleteMany({ employeeId: { $regex: "^TESTDEMO" } });

// 4) Realistic instructors, all reporting to Sneha Iyer (the test CM).
//    The first is Aarav Sharma — linked to the Instructor login (instructor@crm.com).
const roster = [
  { employeeId: "NW10001", name: "Aarav Sharma", email: "instructor@crm.com", campus: "Hyderabad", status: "IN_TRAINING",
    v: { track: "Frontend Development", pct: 68, qual: "B.Tech", phone: "9849012345", doj: "2024-08-12", review: 4, att: 94, college: "VNR VJIET", subject: "Web Development", iscore: 8, src: "Referral" } },
  { employeeId: "NW10002", name: "Priya Reddy", email: "priya.reddy@niat.edu", campus: "Bengaluru", status: "CONFIRMED",
    v: { track: "Backend Development", pct: 91, qual: "M.Tech", phone: "9740156782", doj: "2023-11-20", review: 5, att: 97, college: "RV College of Engineering", subject: "Python & APIs", iscore: 9, src: "LinkedIn" } },
  { employeeId: "NW10003", name: "Karthik Nair", email: "karthik.nair@niat.edu", campus: "Chennai", status: "IN_TRAINING",
    v: { track: "DSA", pct: 54, qual: "B.E", phone: "9962233445", doj: "2024-06-03", review: 4, att: 89, college: "SSN College of Engineering", subject: "Data Structures", iscore: 7, src: "Campus" } },
  { employeeId: "NW10004", name: "Ananya Iyer", email: "ananya.iyer@niat.edu", campus: "Pune", status: "ONBOARDING",
    v: { track: "Gen AI", pct: 22, qual: "M.Tech", phone: "9028765431", doj: "2025-01-15", review: 3, att: 86, college: "COEP Technological University", subject: "Generative AI", iscore: 8, src: "Referral" } },
  { employeeId: "NW10005", name: "Rohan Mehta", email: "rohan.mehta@niat.edu", campus: "Delhi", status: "CONFIRMED",
    v: { track: "DSML", pct: 83, qual: "MCA", phone: "9810334256", doj: "2023-09-01", review: 5, att: 96, college: "NSUT Delhi", subject: "Machine Learning", iscore: 9, src: "LinkedIn" } },
  { employeeId: "NW10006", name: "Divya Patel", email: "divya.patel@niat.edu", campus: "Vijayawada", status: "IN_TRAINING",
    v: { track: "Frontend Development", pct: 47, qual: "B.Tech", phone: "9533871024", doj: "2024-10-10", review: 4, att: 91, college: "VR Siddhartha Engineering College", subject: "React JS", iscore: 7, src: "Campus" } },
];

const deadlineFrom = (doj, days) => new Date(new Date(doj).getTime() + days * 86400000).toISOString().slice(0, 10);

for (const r of roster) {
  const values = {
    phone: r.v.phone, qualification: r.v.qual, domain: r.v.track, doj: r.v.doj,
    primary_track: r.v.track, primary_pct: String(r.v.pct),
    track_deadline: deadlineFrom(r.v.doj, 180),
    interview_score: String(r.v.iscore), recruitment_source: r.v.src,
    deploy_college: r.v.college, deploy_subject: r.v.subject,
    review_score: String(r.v.review), attendance: String(r.v.att),
  };
  const existing = await Instructor.findOne({ employeeId: r.employeeId });
  if (existing) {
    existing.name = r.name; existing.email = r.email; existing.campus = r.campus;
    existing.status = r.status; existing.currentManagerId = cm._id; existing.values = values;
    await existing.save();
  } else {
    const created = await Instructor.create({
      employeeId: r.employeeId, name: r.name, email: r.email, campus: r.campus, status: r.status,
      currentManagerId: cm._id,
      assignments: [{ managerId: cm._id, assignedById: actorId }],
      values,
      lifecycle: [{ status: r.status, note: "Initial record", actorId, actorName }],
    });
    await AuditLog.create({ instructorId: created._id, instructorName: created.name, actorId, actorName,
      actorRole: "OPS_ADMIN", action: "INSTRUCTOR_CREATE", reason: "Onboarded" });
  }
}

console.log("\n✅ Test credentials ready (password shown):\n");
console.log("  Role                 Name             Email                          Password");
console.log("  -------------------  ---------------  -----------------------------  --------------");
console.log("  Ops Admin (super)    Super Admin      superadmin@crm.com             Admin@12345");
console.log("  Senior Manager       Rajesh Verma     seniormanager@crm.com          Senior@123");
console.log("  Capability Manager   Sneha Iyer       capabilitymanager@crm.com      Capability@123");
console.log("  Instructor           Aarav Sharma     instructor@crm.com             Instructor@123");
console.log("\n  Sneha Iyer (CM) reports to Rajesh Verma (SM).");
console.log("  6 instructors (NW10001–NW10006) report to Sneha; NW10001 (Aarav) is the Instructor login's own profile.");
console.log("\n⚠️  Seeded test data — remove before go-live (instructors NW10001–NW10006; users *@crm.com except superadmin).");

await mongoose.disconnect();
process.exit(0);
