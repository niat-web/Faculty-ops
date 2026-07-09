// Mongoose models — ported 1:1 from the Next app (identical collections + fields,
// so the existing Atlas data works unchanged).
import { Schema, model, models, Types } from "mongoose";

const compile = (name: string, schema: Schema) => (models[name] as any) || model(name, schema);

// ---------------------------------------------------------------------------
// User
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true },
    active: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExp: { type: Date, default: null },
    mustSetPassword: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null },
    twoFactorLastCounter: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null }, // sessions issued before this are rejected
    lastLoginAt: { type: Date, default: null }, // set on each successful login (presence tracking)
    lastSeenAt: { type: Date, default: null },  // bumped on authenticated activity (throttled) → live status

    savedViews: { type: [new Schema({ name: String, query: String }, { _id: true })], default: [] },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Instructor
const AssignmentSchema = new Schema(
  {
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    assignedById: { type: Schema.Types.ObjectId, ref: "User" },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { _id: false }
);
const NoteSchema = new Schema(
  { body: String, authorId: { type: Schema.Types.ObjectId, ref: "User" }, authorName: String, createdAt: { type: Date, default: Date.now } },
  { _id: true }
);
const LifecycleEventSchema = new Schema(
  { status: String, note: String, actorId: { type: Schema.Types.ObjectId, ref: "User" }, actorName: String, createdAt: { type: Date, default: Date.now } },
  { _id: true }
);
const InstructorSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    uid: { type: String, default: null },
    name: { type: String, required: true },
    email: { type: String, default: null },
    campus: { type: String, default: null },
    status: { type: String, default: "ONBOARDING" },
    currentManagerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignments: { type: [AssignmentSchema], default: [] },
    values: { type: Map, of: String, default: {} },
    skills: { type: Map, of: Boolean, default: {} },
    moduleStatus: { type: Map, of: String, default: {} },
    exit: {
      lastWorkingDay: { type: String, default: null },
      typeOfExit: { type: String, default: null },
      reason: { type: String, default: null },
      detailedReason: { type: String, default: null },
      items: { type: Map, of: Boolean, default: {} },
    },
    documents: {
      type: [new Schema({
        name: String, path: String,
        uploadedById: { type: Schema.Types.ObjectId, ref: "User" }, uploadedByName: String,
        createdAt: { type: Date, default: Date.now },
      }, { _id: true })],
      default: [],
    },
    notes: { type: [NoteSchema], default: [] },
    lifecycle: { type: [LifecycleEventSchema], default: [] },
  },
  { timestamps: true }
);
InstructorSchema.index({ currentManagerId: 1 });
// Unique per real email (nulls allowed) so two instructors can't share an email (breaks /me). (Bug B6)
// Partial filter skips null/missing emails; build failure (pre-existing dupes) is caught in db.ts and logged.
InstructorSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
InstructorSchema.index({ status: 1 });
InstructorSchema.index({ name: "text", employeeId: "text", campus: "text" });

// ---------------------------------------------------------------------------
// FieldDefinition
const FieldDefinitionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    module: { type: String, required: true },
    type: { type: String, required: true },
    visibility: { type: String, required: true },
    scope: { type: String, required: true },
    options: { type: [String], default: [] },
    defaultValue: { type: String, default: null },
    required: { type: Boolean, default: false },
    selfEditable: { type: Boolean, default: true }, // may an instructor edit this on their own profile?
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    pattern: { type: String, default: null },
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", default: null },
    archivedAt: { type: Date, default: null },
    archiveReason: { type: String, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
FieldDefinitionSchema.index({ scope: 1, key: 1, instructorId: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// TrainingColumn — admin-configurable columns of the Instructors Training Stats grid.
// Each column belongs to a track tab (tech / math_aptitude / english), optionally a
// group header, has a type, and is stored either in Instructor.moduleStatus or .values.
const TrainingColumnSchema = new Schema(
  {
    track: { type: String, required: true },            // "tech" | "math_aptitude" | "english"
    group: { type: String, default: "" },               // section header (e.g. "Frontend Development")
    label: { type: String, required: true },            // column header
    key: { type: String, required: true },              // storage key (moduleStatus key or values key)
    courseId: { type: String, default: "" },            // external learning DB course id (settings metadata)
    storage: { type: String, default: "module" },       // "module" | "value"
    type: { type: String, default: "STATUS" },          // STATUS | DROPDOWN | TEXT | NUMBER | DATE
    options: { type: [String], default: [] },           // for DROPDOWN
    order: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
TrainingColumnSchema.index({ track: 1, order: 1 });
TrainingColumnSchema.index({ track: 1, key: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });

// ---------------------------------------------------------------------------
// MasterColumn — admin-configurable columns of the Instructor Master grid.
// source: "core" (Instructor doc field) | "manager" (currentManagerId) | "value" (dynamic field key).
// `locked` columns (Employee ID, Name, Capability Manager) can't be deleted/reordered out.
const MasterColumnSchema = new Schema(
  {
    key: { type: String, required: true },              // core field | "managerId" | dynamic field key
    label: { type: String, required: true },            // header shown in the grid
    source: { type: String, default: "value" },         // core | manager | value
    type: { type: String, default: "TEXT" },            // TEXT | NUMBER | DATE | DROPDOWN | MANAGER
    options: { type: [String], default: [] },           // for DROPDOWN
    order: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },          // essential column (can't delete)
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
MasterColumnSchema.index({ order: 1 });
MasterColumnSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });

// ---------------------------------------------------------------------------
// EditRequest
const EditRequestSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", required: true },
    instructorName: String,
    fieldKey: String, fieldLabel: String, oldValue: String, newValue: String,
    reason: { type: String, required: true },
    proofPath: { type: String, default: null },
    status: { type: String, default: "PENDING" },
    requesterId: { type: Schema.Types.ObjectId, ref: "User" }, requesterName: String,
    approverId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decisionComment: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    comments: {
      type: [new Schema({ body: String, authorId: { type: Schema.Types.ObjectId, ref: "User" }, authorName: String, createdAt: { type: Date, default: Date.now } }, { _id: true })],
      default: [],
    },
  },
  { timestamps: true }
);
EditRequestSchema.index({ approverId: 1, status: 1 });
EditRequestSchema.index({ requesterId: 1, status: 1 });

// ---------------------------------------------------------------------------
// EditRequestBatch — a SINGLE change request bundling many field edits (across one or
// more instructors), raised by a CM/SM and approved/rejected as a whole by an Ops Admin.
// Lets the requester edit any number of fields/instructors freely, then submit them all at once.
const BatchItemSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", required: true },
    instructorName: String,
    fieldKey: String, fieldLabel: String, oldValue: String, newValue: String,
  },
  { _id: true }
);
const EditRequestBatchSchema = new Schema(
  {
    items: { type: [BatchItemSchema], default: [] },
    reason: { type: String, default: "" },
    status: { type: String, default: "PENDING" }, // PENDING | APPROVED | REJECTED
    requesterId: { type: Schema.Types.ObjectId, ref: "User" }, requesterName: String, requesterRole: String,
    approverId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decisionComment: { type: String, default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
EditRequestBatchSchema.index({ approverId: 1, status: 1 });
EditRequestBatchSchema.index({ requesterId: 1, status: 1 });

// ---------------------------------------------------------------------------
const AuditLogSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", default: null },
    instructorName: String,
    actorId: { type: Schema.Types.ObjectId, ref: "User" }, actorName: String, actorRole: String,
    action: String, fieldName: String, oldValue: String, newValue: String, reason: String, proofPath: String,
    createdAt: { type: Date, default: Date.now },
  },
  { capped: false }
);
AuditLogSchema.index({ instructorId: 1 });
AuditLogSchema.index({ createdAt: -1 });

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: String, title: String, body: String, link: String,
  read: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now },
});
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// ExitAlert — one row per (employee, exitDate) whose Darwinbox last-working-day fell
// inside the admin-configured lead window. Ops/SM see all pending; the Capability
// Manager the instructor reports to (managerId) sees theirs and finalises the outcome.
const ExitAlertSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", default: null },
    employeeId: { type: String, required: true },
    name: String,
    email: String,
    role: String,          // Darwinbox designation
    mobile: String,
    department: String,
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // capability manager (currentManagerId)
    managerName: String,
    exitDate: { type: String, required: true }, // yyyy-mm-dd (last working day)
    status: { type: String, default: "PENDING" }, // PENDING | RESOLVED
    resolution: { type: String, default: null },  // UNIVERSITY_PAYROLL | EXITED | CONSULTANT_REHIRE
    university: { type: String, default: null },   // chosen university (only for UNIVERSITY_PAYROLL)
    resolutionNote: { type: String, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedByName: String,
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
// One alert per employee + exit date (a changed exit date raises a fresh alert).
ExitAlertSchema.index({ employeeId: 1, exitDate: 1 }, { unique: true });
ExitAlertSchema.index({ status: 1, managerId: 1 });

const LoginAttemptSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 }, first: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null }, updatedAt: { type: Date, default: Date.now },
});
LoginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

const LoginEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  email: String, name: String, role: String, method: String, ip: String, userAgent: String,
  at: { type: Date, default: Date.now },
});
LoginEventSchema.index({ userId: 1, at: -1 });

// ---------------------------------------------------------------------------
// AppSetting — single global document holding admin-configurable system settings.
// roleAccess gates whether users of a given role may log in / use the portal.
const AppSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    roleAccess: {
      OPS_ADMIN: { type: Boolean, default: true },
      SENIOR_MANAGER: { type: Boolean, default: true },
      CAPABILITY_MANAGER: { type: Boolean, default: true },
      INSTRUCTOR: { type: Boolean, default: true },
    },
    // Per-event email toggles (admin-controlled at /app/settings/emails). Missing key = enabled.
    emailSettings: { type: Schema.Types.Mixed, default: {} },
    // Per-event IN-APP notification toggles (/app/settings/notifications). Missing key = enabled.
    notifySettings: { type: Schema.Types.Mixed, default: {} },
    // General / branding (/app/settings/general): { appName, organisation, appUrl, supportEmail }.
    general: { type: Schema.Types.Mixed, default: {} },
    // Security policy (/app/settings/security): { passwordMinLength, requireComplexity, maxLoginAttempts, lockoutMinutes }.
    security: { type: Schema.Types.Mixed, default: {} },
    // Data & retention (/app/settings/data): { retentionDays }.
    dataRetention: { type: Schema.Types.Mixed, default: {} },
    // Exit alerts (/app/settings/exit-alerts): { leadDays } — raise an alert this many days
    // before an instructor's Darwinbox last-working-day.
    exitAlerts: { type: Schema.Types.Mixed, default: {} },
    // Certificates public form (/app/settings/certifications): { enabled, requireLogin }.
    certForm: { type: Schema.Types.Mixed, default: {} },
    // University names an Ops Admin manages — offered in the CM exit modal when moving to University payroll.
    universities: { type: [String], default: [] },
    // Instructor-Master department quick-filter control (/app/settings/operations):
    //   { hidden: string[] } — exact department names unchecked BY DEFAULT in the Master's Departments menu.
    // When absent, the app falls back to the built-in non-teaching-support default (Delivery Support / Product Team / …).
    masterDepartments: { type: Schema.Types.Mixed, default: {} },
    // Which payroll entities the Instructor Master grid shows (Ops-controlled): { nxtwave, university } booleans.
    // Missing = both true (show all). The Instructor-Moved page ignores this and shows ALL University-payroll people.
    masterPayroll: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// SeniorManager — admin-curated list of Senior Managers, picked from Darwinbox by Employee ID.
// Drives the Roles "Senior Manager" count/list and seeds a pending User account (login off until activated).
const SeniorManagerSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: String,
    email: String,
    department: String,
    designation: String,
    addedById: { type: Schema.Types.ObjectId, ref: "User" },
    addedByName: String,
  },
  { timestamps: true }
);

// Certification — one submission of the public Certificates form (per employee, keyed by Employee ID).
// Uploaded files go to Google Drive; only the shareable links are stored here.
const CertificationSchema = new Schema(
  {
    employeeId: { type: String, default: "NA", index: true },
    fullName: String,
    email: String,
    department: String,
    capabilityManagerName: String,
    degreeType: String,          // Current Highest Degree Type
    highestQualification: String,
    domain: String,              // Domain / Specialization
    yearOfPassing: String,
    odHave: String,              // Do you have your Original Degree (OD)?
    odExpected: String,          // OD — Expected Month & Year
    cmmHave: String, cmmExpected: String,
    pcHave: String, pcExpected: String,
    remarks: String,
    odLink: String,              // Drive links
    cmmLink: String,
    pcLink: String,
    // Schema-driven answers (the form is admin-configurable): every field's value keyed by field key.
    // FILE fields store their Drive link here. New submissions use this; the legacy columns above are
    // kept for older data + backward-compatible reads.
    answers: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

// DarwinboxEmployee — a MongoDB mirror of the FULL Darwinbox directory (every employee, all
// departments), refreshed by the hourly Darwinbox sync. This is what lets the Org chart, the
// Senior-Manager picker, CM scoping and the Removed-list enrichment serve from MongoDB instead of
// calling Darwinbox live on a page load. One doc per Employee ID (upserted — no duplicates).
const DarwinboxEmployeeSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: String,
    email: { type: String, default: "", index: true }, // lowercased org email
    department: String,
    designation: String,
    managerName: String,        // "Full Name (NWxxxx)" as Darwinbox writes it
    managerEmployeeId: String,  // resolved NW code of their own manager
    syncedAt: { type: Date, default: null }, // last time this row was seen in the Darwinbox feed
  },
  { timestamps: true }
);

// RemovedInstructor — a person (instructor OR staff) an admin has HIDDEN from the app. Keyed by
// Employee ID (works even for Darwinbox-only people with no Instructor doc). This is a HIDE, not a
// delete: the underlying Instructor doc and the Darwinbox record are untouched. Any row whose
// Employee ID is here is excluded from the Master, Exited grid, Org chart (incl. CM counts), Training
// Stats, Contribution rollups and role counts — everywhere in the app — until it is restored.
const RemovedInstructorSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: String,
    email: String,
    department: String,
    reason: { type: String, default: null },
    removedById: { type: Schema.Types.ObjectId, ref: "User" },
    removedByName: String,
  },
  { timestamps: true }
);

// FieldModule — admin-definable sections that group dynamic fields (Personal Details, etc.).
const FieldModuleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    order: { type: Number, default: 0 },
    builtin: { type: Boolean, default: false }, // the original 7 — can't be deleted
  },
  { timestamps: true }
);

export const User = compile("User", UserSchema);
export const AppSetting = compile("AppSetting", AppSettingSchema);
export const FieldModule = compile("FieldModule", FieldModuleSchema);
export const Instructor = compile("Instructor", InstructorSchema);
export const FieldDefinition = compile("FieldDefinition", FieldDefinitionSchema);
export const TrainingColumn = compile("TrainingColumn", TrainingColumnSchema);
export const MasterColumn = compile("MasterColumn", MasterColumnSchema);
// InstructorMail — log of lifecycle emails sent to an instructor (for the Mails menu: status + resend).
const InstructorMailSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", index: true },
    kind: String,    // ONBOARD | DOCUMENTS | REPORTING_DAY
    to: String,
    subject: String,
    status: String,  // SENT | FAILED | SKIPPED
    error: String,
    sentById: { type: Schema.Types.ObjectId, ref: "User" },
    sentByName: String,
  },
  { timestamps: true }
);
InstructorMailSchema.index({ instructorId: 1, kind: 1, createdAt: -1 });

export const EditRequest = compile("EditRequest", EditRequestSchema);
export const EditRequestBatch = compile("EditRequestBatch", EditRequestBatchSchema);
export const InstructorMail = compile("InstructorMail", InstructorMailSchema);
export const AuditLog = compile("AuditLog", AuditLogSchema);
export const Notification = compile("Notification", NotificationSchema);
export const ExitAlert = compile("ExitAlert", ExitAlertSchema);
export const SeniorManager = compile("SeniorManager", SeniorManagerSchema);
export const RemovedInstructor = compile("RemovedInstructor", RemovedInstructorSchema);
export const DarwinboxEmployee = compile("DarwinboxEmployee", DarwinboxEmployeeSchema);
export const Certification = compile("Certification", CertificationSchema);
export const LoginAttempt = compile("LoginAttempt", LoginAttemptSchema);
export const LoginEvent = compile("LoginEvent", LoginEventSchema);
export type ID = Types.ObjectId | string;
