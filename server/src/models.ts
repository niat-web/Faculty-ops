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
export const InstructorMail = compile("InstructorMail", InstructorMailSchema);
export const AuditLog = compile("AuditLog", AuditLogSchema);
export const Notification = compile("Notification", NotificationSchema);
export const LoginAttempt = compile("LoginAttempt", LoginAttemptSchema);
export const LoginEvent = compile("LoginEvent", LoginEventSchema);
export type ID = Types.ObjectId | string;
