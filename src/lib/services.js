import { connectDB } from "./db.js";
import { AuditLog, Notification, Instructor, User, LoginEvent } from "@/models/index.js";
import { sendEmail } from "./email.js";
import { encrypt } from "./crypto.js";
import { escapeHtml } from "./text.js";

// Record a successful sign-in for login history (best-effort; never blocks login).
export async function recordLogin(user, method, req) {
  try {
    await connectDB();
    const h = req?.headers;
    const ip = (h?.get?.("x-forwarded-for") || "").split(",")[0].trim() || h?.get?.("x-real-ip") || null;
    const userAgent = h?.get?.("user-agent") || null;
    await LoginEvent.create({ userId: user._id, email: user.email, name: user.name, role: user.role, method, ip, userAgent });
  } catch (e) { console.error("[login] tracking failed:", e?.message); }
}

// Uploads are stored in GridFS (persists on serverless). Re-exported for callers.
export { saveUpload } from "./storage.js";

// ---- Audit (append-only; no update/delete helper exists) ------------------
export async function writeAudit(data) {
  await connectDB();
  return AuditLog.create(data);
}

// ---- Notifications (in-app + email) ---------------------------------------
export async function notify(userId, { type, title, body, link, email = true }) {
  if (!userId) return;
  await connectDB();
  await Notification.create({ userId, type, title, body, link });
  if (email) {
    const u = await User.findById(userId).select("email name emailNotifications").lean();
    if (u?.email && u.emailNotifications !== false) {
      const url = (process.env.APP_URL || "http://localhost:3000") + (link || "");
      // Fire-and-forget: don't block the request on SES latency/failures.
      sendEmail({
        to: u.email,
        subject: title,
        html: `<p>Hi ${escapeHtml(u.name || "")},</p><p>${escapeHtml(body || title)}</p><p><a href="${url}">Open in CRM</a></p>`,
        text: `${body || title}\n${url}`,
      }).catch((e) => console.error("[notify] email failed:", e?.message));
    }
  }
}

// ---- Field value change + audit -------------------------------------------
export async function applyFieldChange({ actor, instructorId, fieldKey, fieldLabel, oldValue, newValue, reason, proofPath, sensitive = false, action = "FIELD_EDIT" }) {
  await connectDB();
  const inst = await Instructor.findById(instructorId);
  if (!inst) throw new Error("Instructor not found");
  // Sensitive values are encrypted at rest (no-op unless ENCRYPTION_KEY is set).
  inst.values.set(fieldKey, sensitive ? encrypt(newValue ?? "") : (newValue ?? ""));
  await inst.save();
  await writeAudit({
    instructorId,
    instructorName: inst.name,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    fieldName: fieldLabel,
    // Audit log stores a masked marker for sensitive values, never the secret.
    oldValue: sensitive ? "••••" : (oldValue ?? null),
    newValue: sensitive ? "••••" : (newValue ?? null),
    reason: reason ?? null,
    proofPath: proofPath ?? null,
  });
}

// ---- Value validation -----------------------------------------------------
// `rules` (optional): { min, max, pattern } from the field definition.
export function validateValue(type, value, rules = {}) {
  if (value == null || value === "") return null;
  switch (type) {
    case "NUMBER": {
      const n = Number(value);
      if (isNaN(n)) return "Must be a number.";
      if (rules.min != null && n < rules.min) return `Must be at least ${rules.min}.`;
      if (rules.max != null && n > rules.max) return `Must be at most ${rules.max}.`;
      return null;
    }
    case "DATE":
      return isNaN(Date.parse(value)) ? "Must be a valid date." : null;
    case "BOOLEAN":
      return ["true", "false", "yes", "no"].includes(String(value).toLowerCase())
        ? null : "Must be yes/no.";
    case "TEXT":
      if (rules.pattern) {
        try { if (!new RegExp(rules.pattern).test(String(value))) return "Does not match the required format."; }
        catch { /* invalid stored pattern → skip */ }
      }
      return null;
    default:
      return null;
  }
}

export function keyFromLabel(label) {
  return label.toLowerCase().trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
}
