import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

// Helper so hot-reload doesn't recompile models.
const compile = (name, schema) => models[name] || model(name, schema);

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true }, // Role
    active: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true }, // per-user setting
    // A Capability Manager reports to one Senior Manager (approval routing).
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Self-service password reset
    resetTokenHash: { type: String, default: null },
    resetTokenExp: { type: Date, default: null },
    // True until the user sets their own password via the emailed link
    // (admins never type passwords — accounts are created "pending").
    mustSetPassword: { type: Boolean, default: false },
    // Two-factor authentication (TOTP)
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null }, // encrypted at rest
    // Saved instructor-list filter views
    savedViews: {
      type: [new Schema({ name: String, query: String }, { _id: true })],
      default: [],
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Instructor — the subject of every profile
// Dynamic field values live in `values` (keyed by FieldDefinition.key).
// ---------------------------------------------------------------------------
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
  {
    body: String,
    authorId: { type: Schema.Types.ObjectId, ref: "User" },
    authorName: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const LifecycleEventSchema = new Schema(
  {
    status: String,
    note: String,
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const InstructorSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    uid: { type: String, default: null }, // sensitive
    name: { type: String, required: true },
    email: { type: String, default: null },
    campus: { type: String, default: null },
    status: { type: String, default: "ONBOARDING" }, // LifecycleStatus

    currentManagerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignments: { type: [AssignmentSchema], default: [] },

    // Dynamic field values: { [fieldKey]: stringValue }
    values: { type: Map, of: String, default: {} },

    // Training-track skill checklist completion: { [skillKey]: true }
    skills: { type: Map, of: Boolean, default: {} },

    // Full per-module training status from the track sheets:
    // { [moduleName]: "✅ Completed" | "🟡 In Progress" | "⏸ On Hold" | "❌ Not Started" }
    moduleStatus: { type: Map, of: String, default: {} },

    // Exit / offboarding checklist
    exit: {
      lastWorkingDay: { type: String, default: null },
      typeOfExit: { type: String, default: null },
      reason: { type: String, default: null },
      detailedReason: { type: String, default: null },
      items: { type: Map, of: Boolean, default: {} },
    },

    // Uploaded documents (certificates, ID proofs, etc.)
    documents: {
      type: [new Schema({
        name: String, path: String,
        uploadedById: { type: Schema.Types.ObjectId, ref: "User" },
        uploadedByName: String,
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
InstructorSchema.index({ email: 1 });
InstructorSchema.index({ status: 1 });
InstructorSchema.index({ name: "text", employeeId: "text", campus: "text" });

// ---------------------------------------------------------------------------
// FieldDefinition — dynamic schema
// ---------------------------------------------------------------------------
const FieldDefinitionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    module: { type: String, required: true }, // Module
    type: { type: String, required: true }, // FieldType
    visibility: { type: String, required: true }, // Visibility
    scope: { type: String, required: true }, // FieldScope
    options: { type: [String], default: [] }, // for DROPDOWN
    defaultValue: { type: String, default: null },
    required: { type: Boolean, default: false },
    // Optional validation rules
    min: { type: Number, default: null }, // NUMBER lower bound
    max: { type: Number, default: null }, // NUMBER upper bound
    pattern: { type: String, default: null }, // TEXT regex (source)
    // INSTANCE scope → target instructor
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", default: null },
    archivedAt: { type: Date, default: null },
    archiveReason: { type: String, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
FieldDefinitionSchema.index({ scope: 1, key: 1, instructorId: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// EditRequest — Capability Manager change request + approval
// ---------------------------------------------------------------------------
const EditRequestSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", required: true },
    instructorName: String,
    fieldKey: String,
    fieldLabel: String,
    oldValue: String,
    newValue: String,
    reason: { type: String, required: true },
    proofPath: { type: String, default: null },
    status: { type: String, default: "PENDING" }, // RequestStatus
    requesterId: { type: Schema.Types.ObjectId, ref: "User" },
    requesterName: String,
    approverId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decisionComment: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    comments: {
      type: [new Schema({
        body: String,
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        authorName: String,
        createdAt: { type: Date, default: Date.now },
      }, { _id: true })],
      default: [],
    },
  },
  { timestamps: true }
);
EditRequestSchema.index({ approverId: 1, status: 1 });
EditRequestSchema.index({ requesterId: 1, status: 1 });

// ---------------------------------------------------------------------------
// AuditLog — append-only
// ---------------------------------------------------------------------------
const AuditLogSchema = new Schema(
  {
    instructorId: { type: Schema.Types.ObjectId, ref: "Instructor", default: null },
    instructorName: String,
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,
    action: String, // AuditAction
    fieldName: String,
    oldValue: String,
    newValue: String,
    reason: String,
    proofPath: String,
    createdAt: { type: Date, default: Date.now },
  },
  { capped: false }
);
AuditLogSchema.index({ instructorId: 1 });
AuditLogSchema.index({ createdAt: -1 });

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------
const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: String, // NotificationType
    title: String,
    body: String,
    link: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  {}
);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Rate-limit / lockout counters (shared across instances). Auto-expire after 1h.
const LoginAttemptSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  first: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});
LoginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

export const LoginAttempt = compile("LoginAttempt", LoginAttemptSchema);

// Successful sign-in events (for per-user login history).
const LoginEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  email: String,
  name: String,
  role: String,
  method: String, // password | google | 2fa
  ip: String,
  userAgent: String,
  at: { type: Date, default: Date.now },
});
LoginEventSchema.index({ userId: 1, at: -1 });
export const LoginEvent = compile("LoginEvent", LoginEventSchema);

export const User = compile("User", UserSchema);
export const Instructor = compile("Instructor", InstructorSchema);
export const FieldDefinition = compile("FieldDefinition", FieldDefinitionSchema);
export const EditRequest = compile("EditRequest", EditRequestSchema);
export const AuditLog = compile("AuditLog", AuditLogSchema);
export const Notification = compile("Notification", NotificationSchema);
