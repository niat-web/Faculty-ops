import bcrypt from "bcryptjs";
import { connectDB } from "./db.js";
import { User, Instructor, FieldDefinition, EditRequest, AuditLog, Notification } from "../models/index.js";

const hash = (p) => bcrypt.hashSync(p, 10);
const CAMPUSES = ["Hyderabad", "Bengaluru", "Chennai", "Pune", "Delhi"];
const TRACKS = ["Frontend Development", "Backend Development", "DSA", "Gen AI", "DSML"];

export const FIELD_DEFS = [
  { key: "phone", label: "Phone", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "qualification", label: "Qualification", module: "PERSONAL", type: "TEXT", visibility: "NECESSARY" },
  { key: "domain", label: "Domain", module: "PERSONAL", type: "TEXT", visibility: "PUBLIC" },
  { key: "doj", label: "Date of Joining", module: "PERSONAL", type: "DATE", visibility: "NECESSARY" },
  { key: "payroll", label: "Payroll (CTC)", module: "PERSONAL", type: "NUMBER", visibility: "SENSITIVE" },
  { key: "uid_internal", label: "UID", module: "PERSONAL", type: "TEXT", visibility: "SENSITIVE" },
  { key: "primary_track", label: "Primary Track", module: "TRAINING", type: "DROPDOWN", visibility: "NECESSARY", options: TRACKS },
  { key: "primary_pct", label: "Primary % Done", module: "TRAINING", type: "NUMBER", visibility: "NECESSARY" },
  { key: "track_deadline", label: "Track Deadline", module: "TRAINING", type: "DATE", visibility: "NECESSARY" },
  { key: "interview_score", label: "Interview Score", module: "HIRING", type: "NUMBER", visibility: "SENSITIVE" },
  { key: "recruitment_source", label: "Recruitment Source", module: "HIRING", type: "TEXT", visibility: "SENSITIVE" },
  { key: "deploy_college", label: "Deployment College", module: "DEPLOYMENT", type: "TEXT", visibility: "SENSITIVE" },
  { key: "deploy_subject", label: "Subject", module: "DEPLOYMENT", type: "TEXT", visibility: "SENSITIVE" },
  { key: "review_score", label: "Latest Review Score", module: "PERFORMANCE", type: "NUMBER", visibility: "NECESSARY" },
  { key: "attendance", label: "Attendance %", module: "PERFORMANCE", type: "NUMBER", visibility: "NECESSARY" },
];

export async function seedIfEmpty() {
  await connectDB();
  const count = await User.countDocuments();
  if (count > 0) return { skipped: true };
  return forceSeed();
}

export async function forceSeed() {
  await connectDB();
  await Promise.all([
    User.deleteMany({}), Instructor.deleteMany({}), FieldDefinition.deleteMany({}),
    EditRequest.deleteMany({}), AuditLog.deleteMany({}), Notification.deleteMany({}),
  ]);

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "ops@org.in").toLowerCase();
  const adminPw = process.env.SEED_ADMIN_PASSWORD || "password";

  const ops = await User.create({ email: adminEmail, name: "Asha (Ops Admin)", passwordHash: hash(adminPw), role: "OPS_ADMIN" });
  const sm1 = await User.create({ email: "sm1@org.in", name: "Rohit (Sr Manager)", passwordHash: hash("password"), role: "SENIOR_MANAGER" });
  const sm2 = await User.create({ email: "sm2@org.in", name: "Priya (Sr Manager)", passwordHash: hash("password"), role: "SENIOR_MANAGER" });

  const cmSpec = [
    { email: "cm1@org.in", name: "Kiran (Cap Manager)", mgr: sm1 },
    { email: "cm2@org.in", name: "Sneha (Cap Manager)", mgr: sm1 },
    { email: "cm3@org.in", name: "Arjun (Cap Manager)", mgr: sm2 },
    { email: "cm4@org.in", name: "Divya (Cap Manager)", mgr: sm2 },
  ];
  const cms = [];
  for (const s of cmSpec) {
    cms.push(await User.create({ email: s.email, name: s.name, passwordHash: hash("password"), role: "CAPABILITY_MANAGER", managerId: s.mgr._id }));
  }

  const defs = {};
  for (const d of FIELD_DEFS) {
    defs[d.key] = await FieldDefinition.create({ ...d, scope: "GLOBAL", createdById: ops._id });
  }

  let n = 0;
  const today = new Date();
  for (let c = 0; c < cms.length; c++) {
    const cm = cms[c];
    for (let i = 0; i < 4; i++) {
      n++;
      const status = ["ONBOARDING", "IN_TRAINING", "CONFIRMED", "CONFIRMED"][i];
      const deadline = new Date(today.getTime() + (n % 5) * 7 * 86400000);
      const inst = await Instructor.create({
        employeeId: `EMP${1000 + n}`,
        uid: `UID${5000 + n}`,
        name: `Instructor ${n}`,
        email: `instructor${n}@org.in`,
        campus: CAMPUSES[n % CAMPUSES.length],
        status,
        currentManagerId: cm._id,
        assignments: [{ managerId: cm._id, assignedById: ops._id }],
        values: {
          phone: `98765${10000 + n}`,
          qualification: ["B.Tech", "M.Tech", "MCA"][n % 3],
          domain: TRACKS[n % TRACKS.length],
          payroll: String(600000 + n * 15000),
          uid_internal: `UID${5000 + n}`,
          primary_track: TRACKS[n % TRACKS.length],
          primary_pct: String(35 + ((n * 9) % 60)),
          track_deadline: deadline.toISOString().slice(0, 10),
          interview_score: String(6 + (n % 4)),
          recruitment_source: ["Referral", "LinkedIn", "Campus"][n % 3],
          deploy_college: `College ${String.fromCharCode(65 + (n % 6))}`,
          deploy_subject: ["Web Dev", "Python", "DSA"][n % 3],
          review_score: String(3 + (n % 3)),
          attendance: String(85 + (n % 15)),
        },
        lifecycle: [{ status, note: "Seeded initial status", actorId: ops._id, actorName: ops.name }],
        notes: i === 0 ? [{ body: "Strong communicator, fast learner.", authorId: ops._id, authorName: ops.name }] : [],
      });
      await AuditLog.create({
        instructorId: inst._id, instructorName: inst.name,
        actorId: ops._id, actorName: ops.name, actorRole: "OPS_ADMIN",
        action: "INSTRUCTOR_CREATE", reason: "Migrated from legacy sheet",
      });
    }
  }

  // One pending request from cm1 → sm1
  const reportee = await Instructor.findOne({ currentManagerId: cms[0]._id });
  await EditRequest.create({
    instructorId: reportee._id, instructorName: reportee.name,
    fieldKey: "primary_pct", fieldLabel: "Primary % Done",
    oldValue: reportee.values.get("primary_pct"), newValue: "78",
    reason: "Completed React JS sprint; updating progress.",
    status: "PENDING", requesterId: cms[0]._id, requesterName: cms[0].name, approverId: sm1._id,
  });
  await Notification.create({
    userId: sm1._id, type: "EDIT_REQUEST_SUBMITTED",
    title: "New edit request from Kiran (Cap Manager)",
    body: `Primary % Done for ${reportee.name}`, link: "/app/requests",
  });

  return { ok: true, instructors: n };
}
