// Generate a realistic organization matching the PRD counts and insert into
// MongoDB: 5 Ops Admins, 7 Senior Managers, 25 Capability Managers, 600
// instructors across the 18 NIAT campuses. Non-destructive to the existing
// @crm.com logins (superadmin / seniormanager / capabilitymanager / instructor).
//
//   npm run seed-realistic
//
// All generated logins share the password below. Re-runnable: it clears the
// previously generated data (NW* instructors, @niat.edu / @faculty.niat.edu users)
// first, then regenerates.
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

const PASSWORD = "Password@123";

const dir = path.dirname(fileURLToPath(import.meta.url));
const modelsUrl = pathToFileURL(path.join(dir, "..", "src", "models", "index.js")).href;
const seedUrl = pathToFileURL(path.join(dir, "..", "src", "lib", "seedData.js")).href;

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
console.log("Connected. DB:", mongoose.connection.name);
const { User, Instructor, FieldDefinition, AuditLog } = await import(modelsUrl);
const { FIELD_DEFS } = await import(seedUrl);

// ---- data pools -----------------------------------------------------------
const FIRST = ["Aarav","Vivaan","Aditya","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan","Karthik","Rahul","Aniket","Siddharth","Aryan","Kabir","Dhruv","Ayush","Harsh","Nikhil","Varun","Tarun","Manish","Pranav","Vikram","Suresh","Ramesh","Anil","Gopal","Naveen","Sandeep","Priya","Ananya","Diya","Aadhya","Saanvi","Anika","Navya","Myra","Sara","Kiara","Riya","Sneha","Divya","Pooja","Neha","Shreya","Meera","Lakshmi","Kavya","Tara","Nandini","Isha","Swathi","Deepika","Sahithi","Bhavana","Harika","Madhuri","Sravani","Keerthi"];
const LAST = ["Sharma","Verma","Reddy","Nair","Iyer","Patel","Mehta","Rao","Gupta","Kumar","Singh","Naidu","Pillai","Menon","Das","Banerjee","Mukherjee","Joshi","Desai","Shah","Agarwal","Kulkarni","Deshpande","Bhat","Shetty","Hegde","Prasad","Mishra","Pandey","Yadav","Chauhan","Malhotra","Kapoor","Saxena","Trivedi","Chandra","Varma","Goud","Chowdary","Sastry"];
const CAMPUSES = ["Ajeenkya DY Patil University","AMET University","Annamacharya University","Aurora Deemed University","Chaitanya Deemed to be University","Chalapathi Institute of Engineering","Crescent University","Malla Reddy Vishwavidyapeeth","NIAT - Chevella","NIAT - KKH","Noida International University","NRI Institute of Technology","NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology","S-VYASA University","Sanjay Ghodawat University","Takshashila University","Vivekananda Global University","Yenepoya University"];
const TRACKS = ["Frontend Development","Backend Development","DSA","Gen AI","DSML"];
const SUBJECTS = { "Frontend Development":"Web Development","Backend Development":"Python & APIs","DSA":"Data Structures","Gen AI":"Generative AI","DSML":"Machine Learning" };
const QUALS = ["B.Tech","M.Tech","MCA","B.E","M.Sc"];
const SOURCES = ["Referral","LinkedIn","Campus","Naukri","Internal"];
const STATUS_WEIGHTED = [
  ...Array(45).fill("CONFIRMED"), ...Array(28).fill("IN_TRAINING"), ...Array(13).fill("ONBOARDING"),
  ...Array(6).fill("TRANSFER"), ...Array(4).fill("EXIT_IN_PROGRESS"), ...Array(4).fill("EXITED"),
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const usedEmail = new Set();
function fullName() { return `${pick(FIRST)} ${pick(LAST)}`; }
function emailFor(name, domain) {
  const base = name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".");
  let e = `${base}@${domain}`, n = 1;
  while (usedEmail.has(e)) e = `${base}${++n}@${domain}`;
  usedEmail.add(e);
  return e;
}
function dojDate() { const d = new Date(); d.setDate(d.getDate() - ri(60, 1100)); return d.toISOString().slice(0, 10); }
function deadlineDate() { const d = new Date(); d.setDate(d.getDate() + ri(-30, 120)); return d.toISOString().slice(0, 10); }

async function run() {
  const hash = bcrypt.hashSync(PASSWORD, 10);

  // Keep @crm.com logins; clear previously generated data.
  await Instructor.deleteMany({ employeeId: { $regex: "^NW" } });
  await User.deleteMany({ email: { $regex: "@(niat\\.edu|faculty\\.niat\\.edu)$" } });

  // Ensure field catalog exists.
  const admin0 = await User.findOne({ role: "OPS_ADMIN" }).lean();
  if ((await FieldDefinition.countDocuments()) === 0) {
    for (const d of FIELD_DEFS) await FieldDefinition.create({ ...d, scope: "GLOBAL", createdById: admin0?._id });
  }
  for (const e of ["seniormanager@crm.com", "capabilitymanager@crm.com", "instructor@crm.com"]) usedEmail.add(e);

  // ---- Ops Admins (4 generated + existing superadmin = 5) ----
  const opsDocs = Array.from({ length: 4 }, () => { const name = fullName(); return { email: emailFor(name, "niat.edu"), name, passwordHash: hash, role: "OPS_ADMIN" }; });
  await User.insertMany(opsDocs);

  // ---- Senior Managers (6 generated + existing Rajesh = 7) ----
  const existingSM = await User.findOne({ email: "seniormanager@crm.com" }).lean();
  const smDocs = Array.from({ length: 6 }, () => { const name = fullName(); return { email: emailFor(name, "niat.edu"), name, passwordHash: hash, role: "SENIOR_MANAGER" }; });
  const smCreated = await User.insertMany(smDocs);
  const smPool = [existingSM, ...smCreated].filter(Boolean);

  // ---- Capability Managers (24 generated + existing Sneha = 25) ----
  const cmDocs = Array.from({ length: 24 }, (_, i) => {
    const name = fullName();
    return { email: emailFor(name, "niat.edu"), name, passwordHash: hash, role: "CAPABILITY_MANAGER",
      managerId: smPool[i % smPool.length]._id };
  });
  const cmCreated = await User.insertMany(cmDocs);
  const existingCM = await User.findOne({ email: "capabilitymanager@crm.com" }).lean();
  const cmPool = [existingCM, ...cmCreated].filter(Boolean);

  // ---- 600 Instructors across CMs and campuses ----
  const TOTAL = 600;
  const instructorDocs = [];
  for (let i = 0; i < TOTAL; i++) {
    const name = fullName();
    const cm = cmPool[i % cmPool.length];
    const track = pick(TRACKS);
    const status = pick(STATUS_WEIGHTED);
    const empId = `NW${20001 + i}`;
    // First instructor carries instructor@crm.com so that login's self-view works.
    const email = i === 0 ? "instructor@crm.com" : emailFor(name, "faculty.niat.edu");
    const values = {
      phone: `${pick(["9","8","7","6"])}${ri(100000000, 999999999)}`,
      qualification: pick(QUALS), domain: track, doj: dojDate(),
      payroll: String(ri(50, 120) * 10000),
      uid_internal: `UID${70000 + i}`,
      primary_track: track, primary_pct: String(ri(5, 100)),
      track_deadline: deadlineDate(),
      interview_score: String(ri(5, 10)), recruitment_source: pick(SOURCES),
      deploy_college: pick(CAMPUSES), deploy_subject: SUBJECTS[track],
      review_score: String(ri(2, 5)), attendance: String(ri(72, 100)),
    };
    instructorDocs.push({
      employeeId: empId, uid: `UID${70000 + i}`, name, email, campus: pick(CAMPUSES), status,
      currentManagerId: cm._id, assignments: [{ managerId: cm._id, assignedById: admin0?._id }],
      values,
      lifecycle: [{ status, note: "Onboarded", actorId: admin0?._id, actorName: admin0?.name || "System" }],
    });
  }
  const insertedInstr = await Instructor.insertMany(instructorDocs, { ordered: false });

  // Audit trail for the imports (batched).
  await AuditLog.insertMany(insertedInstr.map((inst) => ({
    instructorId: inst._id, instructorName: inst.name, actorId: admin0?._id, actorName: admin0?.name || "System",
    actorRole: "OPS_ADMIN", action: "INSTRUCTOR_CREATE", reason: "Bulk onboarding", newValue: inst.employeeId,
  })));

  // Counts
  const [ops, sms, cms, instr] = await Promise.all([
    User.countDocuments({ role: "OPS_ADMIN" }), User.countDocuments({ role: "SENIOR_MANAGER" }),
    User.countDocuments({ role: "CAPABILITY_MANAGER" }), Instructor.countDocuments(),
  ]);

  // A few sample logins per role for the user.
  const sampleSM = smCreated[0], sampleCM = cmCreated[0];
  console.log("\n✅ Realistic dataset inserted.\n");
  console.log("  Counts now in DB:");
  console.log(`    Ops Admins         : ${ops}`);
  console.log(`    Senior Managers    : ${sms}`);
  console.log(`    Capability Managers: ${cms}`);
  console.log(`    Instructors        : ${instr}`);
  console.log(`    Campuses           : ${CAMPUSES.length}`);
  console.log("\n  Sample logins (password for ALL generated users: " + PASSWORD + "):");
  console.log(`    Ops Admin (existing) : superadmin@crm.com / Admin@12345`);
  console.log(`    Senior Manager       : ${sampleSM.email}`);
  console.log(`    Capability Manager   : ${sampleCM.email}`);
  console.log(`    Instructor           : instructor@crm.com / Instructor@123`);
  console.log("\n  (Existing @crm.com logins kept: seniormanager@crm.com, capabilitymanager@crm.com)");

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });
