// Instructor lifecycle emails (onboarding, documents, reporting day) — sent to the instructor,
// each gated by its admin toggle (/app/settings/emails) and logged for the per-instructor Mails menu.
import { InstructorMail } from "../models";
import { sendEmail } from "./email";
import { isEmailEnabled } from "./settings";
import { config } from "../config";
import { escapeHtml } from "./text";

export const MAIL_KINDS = [
  { kind: "ONBOARD", toggle: "INSTRUCTOR_ONBOARD", label: "Onboarding welcome" },
  { kind: "DOCUMENTS", toggle: "INSTRUCTOR_DOCUMENTS", label: "Submit documents & details" },
  { kind: "REPORTING_DAY", toggle: "INSTRUCTOR_REPORTING_DAY", label: "Reporting day (deployed)" },
] as const;
export type MailKind = (typeof MAIL_KINDS)[number]["kind"];
const TOGGLE: Record<string, string> = Object.fromEntries(MAIL_KINDS.map((m) => [m.kind, m.toggle]));
const isKind = (k: string): k is MailKind => k in TOGGLE;

const instEmail = (inst: any): string => inst?.email || inst?.values?.email || inst?.values?.personal_email || "";

function wrap(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#4f46e5;margin:0 0 12px">${escapeHtml(title)}</h2>${bodyHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">NIAT — FacultyOps</p></div>`;
}

function template(kind: MailKind, inst: any): { subject: string; html: string; text: string } {
  const name = escapeHtml(inst.name || "there");
  const eid = escapeHtml(inst.employeeId || "");
  const reporting = escapeHtml(String(inst.values?.reporting_day || ""));
  const url = config.appUrl;
  if (kind === "ONBOARD") {
    return {
      subject: "Welcome to NIAT — your onboarding has started",
      html: wrap("Welcome aboard! 🎉", `<p>Hi ${name},</p><p>Your onboarding at <b>NIAT</b> has started (Employee ID <b>${eid}</b>). Our team will guide you through the next steps. We're excited to have you!</p>`),
      text: `Hi ${name}, your onboarding at NIAT has started (Employee ID ${eid}).`,
    };
  }
  if (kind === "DOCUMENTS") {
    return {
      subject: "Action needed: submit your documents & details",
      html: wrap("Complete your profile", `<p>Hi ${name},</p><p>To finish your onboarding, please submit your documents and fill in your details. Reach out to your Capability Manager if you need the document checklist.</p><p><a href="${url}" style="color:#4f46e5">Open the portal</a></p>`),
      text: `Hi ${name}, please submit your documents and complete your details to finish onboarding. ${url}`,
    };
  }
  return {
    subject: "Your reporting day is confirmed",
    html: wrap("You're deployed 🚀", `<p>Hi ${name},</p><p>Your reporting day is confirmed${reporting ? `: <b>${reporting}</b>` : ""}. Please be available and reach out to your Capability Manager for any joining instructions.</p>`),
    text: `Hi ${name}, your reporting day is confirmed${reporting ? `: ${reporting}` : ""}.`,
  };
}

// Send one lifecycle email (respects the admin toggle), and log the attempt. Never throws.
export async function sendInstructorMail(kind: string, inst: any, actor?: { id?: string; name?: string }): Promise<{ ok: boolean; status: string; reason?: string; to?: string }> {
  if (!isKind(kind)) return { ok: false, status: "FAILED", reason: "Unknown mail" };
  try {
    if (!(await isEmailEnabled(TOGGLE[kind]))) return { ok: false, status: "SKIPPED", reason: "This email is turned off in Settings → Emails." };
    const to = instEmail(inst);
    if (!to) return { ok: false, status: "FAILED", reason: "Instructor has no email address." };
    const t = template(kind, inst);
    const r: any = await sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
    // SES-not-configured (dev) still counts as "sent" (it logs) — only a real SES error is a failure.
    const sent = r.delivered || r.reason === "SES not configured";
    const status = sent ? "SENT" : "FAILED";
    await InstructorMail.create({ instructorId: inst._id, kind, to, subject: t.subject, status, error: sent ? null : (r.reason || "Not delivered"), sentById: actor?.id || null, sentByName: actor?.name || "System" });
    return { ok: sent, status, reason: r.reason, to };
  } catch (e: any) {
    try { await InstructorMail.create({ instructorId: inst._id, kind, to: instEmail(inst), status: "FAILED", error: e?.message, sentById: actor?.id || null, sentByName: actor?.name || "System" }); } catch { /* ignore log failure */ }
    return { ok: false, status: "FAILED", reason: e?.message };
  }
}

// Latest status per kind for the Mails menu.
export async function listInstructorMails(instructorId: string) {
  const rows = await InstructorMail.find({ instructorId }).sort({ createdAt: -1 }).lean();
  const byKind: Record<string, any> = {};
  for (const r of rows as any[]) if (!byKind[r.kind]) byKind[r.kind] = r;
  return MAIL_KINDS.map((m) => ({
    kind: m.kind, label: m.label, toggle: m.toggle,
    last: byKind[m.kind] ? { status: byKind[m.kind].status, to: byKind[m.kind].to, sentByName: byKind[m.kind].sentByName, error: byKind[m.kind].error || null, createdAt: byKind[m.kind].createdAt } : null,
  }));
}
