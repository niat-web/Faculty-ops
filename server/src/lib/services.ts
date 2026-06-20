import type { Request } from "express";
import { AuditLog, Notification, Instructor, User, LoginEvent } from "../models";
import { sendEmail } from "./email";
import { encrypt, maybeDecrypt } from "./crypto";
import { escapeHtml } from "./text";
import { config } from "../config";
import type { SessionUser } from "./rbac";

export async function recordLogin(user: any, method: string, req: Request) {
  try {
    const ip = req.ip || (String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await LoginEvent.create({ userId: user._id, email: user.email, name: user.name, role: user.role, method, ip, userAgent });
  } catch (e: any) { console.error("[login] tracking failed:", e?.message); }
}

export async function writeAudit(data: Record<string, any>) { return AuditLog.create(data); }

export async function notify(userId: string, { type, title, body, link, email = true }: { type: string; title: string; body?: string; link?: string; email?: boolean }) {
  if (!userId) return;
  await Notification.create({ userId, type, title, body, link });
  if (email) {
    const u = await User.findById(userId).select("email name emailNotifications").lean();
    if (u?.email && u.emailNotifications !== false) {
      const url = config.appUrl + (link || "");
      sendEmail({ to: u.email, subject: title, html: `<p>Hi ${escapeHtml(u.name || "")},</p><p>${escapeHtml(body || title)}</p><p><a href="${url}">Open in CRM</a></p>`, text: `${body || title}\n${url}` })
        .catch((e) => console.error("[notify] email failed:", e?.message));
    }
  }
}

export async function applyFieldChange({ actor, instructorId, fieldKey, fieldLabel, oldValue, newValue, reason, proofPath, sensitive = false, action = "FIELD_EDIT" }: {
  actor: SessionUser; instructorId: string; fieldKey: string; fieldLabel?: string; oldValue?: string; newValue?: string; reason?: string; proofPath?: string; sensitive?: boolean; action?: string;
}) {
  const inst = await Instructor.findById(instructorId);
  if (!inst) throw new Error("Instructor not found");
  // Record the ACTUAL current value as oldValue (don't trust the client-supplied one).
  const actualOld = maybeDecrypt(inst.values.get(fieldKey)) ?? (oldValue ?? null);
  inst.values.set(fieldKey, sensitive ? encrypt(newValue ?? "") : (newValue ?? ""));
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
