import type { Request } from "express";
import { AuditLog, Notification, Instructor, User, LoginEvent, FieldDefinition } from "../models";
import { sendEmail } from "./email";
import { encrypt, maybeDecrypt, isEncrypted } from "./crypto";
import { escapeHtml } from "./text";
import { SUMMARY_INPUT_KEYS, recomputeInstructorSummary } from "./training";
import { config } from "../config";
import type { SessionUser } from "./rbac";

export async function recordLogin(user: any, method: string, req: Request) {
  try {
    const ip = req.ip || (String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    const now = new Date();
    await LoginEvent.create({ userId: user._id, email: user.email, name: user.name, role: user.role, method, ip, userAgent });
    // Stamp last-login + last-seen on the user for the Users-table presence columns.
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, lastSeenAt: now } });
  } catch (e: any) { console.error("[login] tracking failed:", e?.message); }
}

// Throttled "last seen" bump — called on every authenticated request but only hits the
// DB once per TOUCH_THROTTLE_MS per user (in-process), so it adds ~no per-request cost.
const TOUCH_THROTTLE_MS = 60_000;
const lastTouch = new Map<string, number>();
export function touchLastSeen(userId: string) {
  const now = Date.now();
  const prev = lastTouch.get(userId) || 0;
  if (now - prev < TOUCH_THROTTLE_MS) return;
  lastTouch.set(userId, now);
  User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } }).catch(() => {}); // fire-and-forget
}

export async function writeAudit(data: Record<string, any>) { return AuditLog.create(data); }

// Notification type → admin email-toggle key (so notify() respects /app/settings/emails).
const TYPE_EMAIL_KEY: Record<string, string> = {
  EDIT_REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  EDIT_REQUEST_APPROVED: "REQUEST_APPROVED",
  EDIT_REQUEST_REJECTED: "REQUEST_REJECTED",
  SCHEMA_CHANGED: "SCHEMA_CHANGED",
};

export async function notify(userId: string, { type, title, body, link, email = true, emailKey }: { type: string; title: string; body?: string; link?: string; email?: boolean; emailKey?: string }) {
  if (!userId) return;
  const { isNotifyEnabled, isEmailEnabled, getGeneral } = await import("./settings");
  // In-app notification — recorded unless the admin suppressed this event type.
  if (await isNotifyEnabled(type)) await Notification.create({ userId, type, title, body, link });
  if (email) {
    const key = emailKey || TYPE_EMAIL_KEY[type];
    if (key && !(await isEmailEnabled(key))) return; // admin turned this email off
    const u = await User.findById(userId).select("email name emailNotifications").lean();
    if (u?.email && u.emailNotifications !== false) {
      const url = (await getGeneral()).appUrl + (link || "");
      sendEmail({ to: u.email, subject: title, html: `<p>Hi ${escapeHtml(u.name || "")},</p><p>${escapeHtml(body || title)}</p><p><a href="${url}">Open in CRM</a></p>`, text: `${body || title}\n${url}` })
        .catch((e) => console.error("[notify] email failed:", e?.message));
    }
  }
}

export async function applyFieldChange({ actor, instructorId, fieldKey, fieldLabel, oldValue, newValue, reason, proofPath, sensitive, action = "FIELD_EDIT" }: {
  actor: SessionUser; instructorId: string; fieldKey: string; fieldLabel?: string; oldValue?: string; newValue?: string; reason?: string; proofPath?: string; sensitive?: boolean; action?: string;
}) {
  const inst = await Instructor.findById(instructorId);
  if (!inst) throw new Error("Instructor not found");
  // Resolve sensitivity from the field definition unless the caller forced it — so EVERY edit path
  // (direct, approved request, self-edit) encrypts/​masks consistently. (Bug B2)
  if (sensitive == null) {
    const def: any = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null }).select("visibility").lean();
    sensitive = def?.visibility === "SENSITIVE";
  }
  // Record the ACTUAL current value as oldValue (never the client-supplied one). If the stored value
  // is encrypted but can't be decrypted (rotated key), mark it explicitly rather than faking it. (Bug B5)
  const rawOld = inst.values.get(fieldKey);
  const decOld = maybeDecrypt(rawOld);
  const actualOld = rawOld == null ? null : (isEncrypted(rawOld) && decOld === null ? "[unable to decrypt]" : decOld);
  inst.values.set(fieldKey, sensitive ? encrypt(newValue ?? "") : (newValue ?? ""));
  // Keep the live training summary in sync when a summary input (track/dates) changed. (Bug B1)
  if (SUMMARY_INPUT_KEYS.includes(fieldKey)) { try { await recomputeInstructorSummary(inst); } catch (e: any) { console.error("[summary] recompute failed:", e?.message); } }
  await inst.save();
  await writeAudit({
    instructorId, instructorName: inst.name, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action, fieldName: fieldLabel, oldValue: sensitive ? "••••" : actualOld, newValue: sensitive ? "••••" : (newValue ?? null),
    reason: reason ?? null, proofPath: proofPath ?? null,
  });
}

export function validateValue(type: string, value: any, rules: { min?: number | null; max?: number | null; pattern?: string | null } = {}): string | null {
  if (value == null || value === "") return null;
  switch (type) {
    case "NUMBER": {
      const n = Number(value);
      if (isNaN(n)) return "Must be a number.";
      if (rules.min != null && n < rules.min) return `Must be at least ${rules.min}.`;
      if (rules.max != null && n > rules.max) return `Must be at most ${rules.max}.`;
      return null;
    }
    case "DATE": return isNaN(Date.parse(value)) ? "Must be a valid date." : null;
    case "BOOLEAN": return ["true", "false", "yes", "no"].includes(String(value).toLowerCase()) ? null : "Must be yes/no.";
    case "TEXT":
      if (rules.pattern) { try { if (!new RegExp(rules.pattern).test(String(value))) return "Does not match the required format."; } catch {} }
      return null;
    default: return null;
  }
}
