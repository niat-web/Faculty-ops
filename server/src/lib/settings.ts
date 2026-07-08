// Admin-configurable system settings (single "global" AppSetting document).
// Cached in-process and invalidated on write so per-request reads are cheap.
import { randomUUID } from "crypto";
import { AppSetting } from "../models";
import { config } from "../config";

const KEY = "global";
export const ROLE_DISABLED_MSG = "Access for your role has been disabled by an administrator. Please contact your admin.";
export const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"] as const;
export type AppRole = (typeof ROLES)[number];

let cache: any = null;
let cacheAt = 0;
const TTL_MS = 30_000; // short TTL so a role-access change made on one instance converges quickly across all. (Bug B4)

export async function getSettings() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  let doc = await AppSetting.findOne({ key: KEY });
  if (!doc) doc = await AppSetting.create({ key: KEY });
  cache = doc.toObject();
  cacheAt = Date.now();
  return cache;
}

export function invalidateSettingsCache() { cache = null; cacheAt = 0; }

// Normalised role-access map (defaults every role to enabled if unset).
export async function getRoleAccess(): Promise<Record<string, boolean>> {
  const s = await getSettings();
  const ra = s.roleAccess || {};
  return Object.fromEntries(ROLES.map((r) => [r, ra[r] !== false]));
}

export async function isRoleEnabled(role: string): Promise<boolean> {
  if (role === "OPS_ADMIN") return true; // Ops Admin can never be locked out (prevents total lockout).
  const ra = await getRoleAccess();
  return ra[role] !== false;
}

// ── Email control center ──────────────────────────────────────────────
// Every outgoing email maps to one of these event keys; admin can toggle each
// (grouped by the RECIPIENT role) at /app/settings/emails. Missing = enabled.
export const EMAIL_EVENTS = [
  { key: "REQUEST_SUBMITTED", role: "SENIOR_MANAGER", label: "New edit request to review", desc: "Sent to the Senior Manager when a Capability Manager raises a change request." },
  { key: "REQUEST_APPROVED", role: "CAPABILITY_MANAGER", label: "Your request was approved", desc: "Sent to the Capability Manager when their request is approved." },
  { key: "REQUEST_REJECTED", role: "CAPABILITY_MANAGER", label: "Your request was rejected", desc: "Sent to the Capability Manager when their request is rejected." },
  { key: "REQUEST_SUBMITTED_OPS", role: "OPS_ADMIN", label: "A new edit request was raised", desc: "Copy sent to Ops Admins whenever any change request is raised." },
  { key: "SCHEMA_CHANGED", role: "OPS_ADMIN", label: "A dynamic field was added", desc: "Sent to Ops Admins when a new field/module is created." },
  { key: "INSTRUCTOR_ONBOARD", role: "INSTRUCTOR", label: "Onboarding welcome", desc: "Sent to the instructor when their status is set to Onboarding." },
  { key: "INSTRUCTOR_DOCUMENTS", role: "INSTRUCTOR", label: "Submit documents & details", desc: "Sent to the instructor to collect documents and fill in their details." },
  { key: "INSTRUCTOR_REPORTING_DAY", role: "INSTRUCTOR", label: "Reporting day (deployed)", desc: "Sent to the instructor when their reporting day is set / they are deployed." },
] as const;
export type EmailEventKey = (typeof EMAIL_EVENTS)[number]["key"];
const EMAIL_KEYS = new Set(EMAIL_EVENTS.map((e) => e.key));

export async function getEmailSettings(): Promise<Record<string, boolean>> {
  const s = await getSettings();
  const es = s.emailSettings || {};
  return Object.fromEntries(EMAIL_EVENTS.map((e) => [e.key, es[e.key] !== false])); // default ON
}

export async function isEmailEnabled(key: string): Promise<boolean> {
  if (!key || !EMAIL_KEYS.has(key as EmailEventKey)) return true; // unknown event → don't block
  const es = (await getSettings()).emailSettings || {};
  return es[key] !== false;
}

export async function setEmailSetting(key: EmailEventKey, enabled: boolean) {
  const doc = await AppSetting.findOneAndUpdate(
    { key: KEY },
    { $set: { [`emailSettings.${key}`]: enabled } },
    { new: true, upsert: true }
  );
  cache = doc.toObject();
  cacheAt = Date.now();
  return getEmailSettings();
}

export async function setRoleAccess(role: AppRole, enabled: boolean) {
  const doc = await AppSetting.findOneAndUpdate(
    { key: KEY },
    { $set: { [`roleAccess.${role}`]: enabled } },
    { new: true, upsert: true }
  );
  cache = doc.toObject();
  cacheAt = Date.now();
  return getRoleAccess();
}

// Persist a patch onto the global doc + refresh the cache (shared by general/security/data writers).
async function writeGroup(path: string, patch: Record<string, any>) {
  const $set: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) $set[`${path}.${k}`] = v;
  const doc = await AppSetting.findOneAndUpdate({ key: KEY }, { $set }, { new: true, upsert: true });
  cache = doc.toObject();
  cacheAt = Date.now();
}

// ── In-app notification control center ────────────────────────────────
// Every in-app Notification is created with a `type`; admins can suppress a type
// at /app/settings/notifications (grouped by who receives it). Missing = enabled.
export const NOTIFY_EVENTS = [
  { key: "EDIT_REQUEST_SUBMITTED", role: "SENIOR_MANAGER", label: "New edit request to review", desc: "A Capability Manager raised a change request awaiting your approval." },
  { key: "EDIT_REQUEST_APPROVED", role: "CAPABILITY_MANAGER", label: "Your request was approved", desc: "Your change request was approved." },
  { key: "EDIT_REQUEST_REJECTED", role: "CAPABILITY_MANAGER", label: "Your request was rejected", desc: "Your change request was rejected." },
  { key: "REQUEST_COMMENT", role: "ALL", label: "New comment on a request", desc: "Someone commented on a request you're part of." },
  { key: "SCHEMA_CHANGED", role: "OPS_ADMIN", label: "A dynamic field was added", desc: "A new field/module was created." },
  { key: "EXIT_ALERT", role: "OPS_ADMIN", label: "Instructor exit alert", desc: "An instructor's Darwinbox last-working-day is approaching (Ops Admins & Senior Managers)." },
  { key: "REMINDER", role: "ALL", label: "Reminders & weekly digest", desc: "Pending-request nudges, exit deadlines and the weekly summary." },
] as const;
export type NotifyEventKey = (typeof NOTIFY_EVENTS)[number]["key"];
const NOTIFY_KEYS = new Set(NOTIFY_EVENTS.map((e) => e.key));

export async function getNotifySettings(): Promise<Record<string, boolean>> {
  const s = await getSettings();
  const ns = s.notifySettings || {};
  return Object.fromEntries(NOTIFY_EVENTS.map((e) => [e.key, ns[e.key] !== false])); // default ON
}
export async function isNotifyEnabled(type: string): Promise<boolean> {
  if (!type || !NOTIFY_KEYS.has(type as NotifyEventKey)) return true; // unknown type → never suppress
  const ns = (await getSettings()).notifySettings || {};
  return ns[type] !== false;
}
export async function setNotifySetting(key: NotifyEventKey, enabled: boolean) {
  await writeGroup("notifySettings", { [key]: enabled });
  return getNotifySettings();
}

// ── General / branding ────────────────────────────────────────────────
export type GeneralSettings = { appName: string; organisation: string; appUrl: string; supportEmail: string };
const DEFAULT_GENERAL: GeneralSettings = { appName: "FacultyOps", organisation: "NIAT Campus Suite", appUrl: config.appUrl, supportEmail: "" };
export async function getGeneral(): Promise<GeneralSettings> {
  const g = (await getSettings()).general || {};
  return {
    appName: (g.appName || DEFAULT_GENERAL.appName).toString(),
    organisation: (g.organisation ?? DEFAULT_GENERAL.organisation).toString(),
    appUrl: (g.appUrl || DEFAULT_GENERAL.appUrl).toString().replace(/\/$/, ""),
    supportEmail: (g.supportEmail ?? "").toString(),
  };
}
export async function setGeneral(patch: Partial<GeneralSettings>) {
  await writeGroup("general", patch);
  return getGeneral();
}
// Public branding subset (safe to expose to any signed-in user for the shell/title).
export async function getBranding() {
  const g = await getGeneral();
  return { appName: g.appName, organisation: g.organisation, supportEmail: g.supportEmail };
}

// ── Security policy ───────────────────────────────────────────────────
export type SecuritySettings = { passwordMinLength: number; requireComplexity: boolean; maxLoginAttempts: number; lockoutMinutes: number };
const DEFAULT_SECURITY: SecuritySettings = { passwordMinLength: 8, requireComplexity: true, maxLoginAttempts: 5, lockoutMinutes: 15 };
const clampInt = (v: any, lo: number, hi: number, dflt: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
export async function getSecurity(): Promise<SecuritySettings> {
  const s = (await getSettings()).security || {};
  return {
    passwordMinLength: clampInt(s.passwordMinLength, 6, 64, DEFAULT_SECURITY.passwordMinLength),
    requireComplexity: s.requireComplexity !== false,
    maxLoginAttempts: clampInt(s.maxLoginAttempts, 3, 50, DEFAULT_SECURITY.maxLoginAttempts),
    lockoutMinutes: clampInt(s.lockoutMinutes, 1, 1440, DEFAULT_SECURITY.lockoutMinutes),
  };
}
export async function setSecurity(patch: Partial<SecuritySettings>) {
  const clean: Record<string, any> = {};
  if (patch.passwordMinLength != null) clean.passwordMinLength = clampInt(patch.passwordMinLength, 6, 64, DEFAULT_SECURITY.passwordMinLength);
  if (patch.requireComplexity != null) clean.requireComplexity = !!patch.requireComplexity;
  if (patch.maxLoginAttempts != null) clean.maxLoginAttempts = clampInt(patch.maxLoginAttempts, 3, 50, DEFAULT_SECURITY.maxLoginAttempts);
  if (patch.lockoutMinutes != null) clean.lockoutMinutes = clampInt(patch.lockoutMinutes, 1, 1440, DEFAULT_SECURITY.lockoutMinutes);
  await writeGroup("security", clean);
  return getSecurity();
}

// ── Data & retention ──────────────────────────────────────────────────
export type DataSettings = { retentionDays: number };
export async function getData(): Promise<DataSettings> {
  const d = (await getSettings()).dataRetention || {};
  const v = d.retentionDays;
  return { retentionDays: v == null ? (config.retentionDays || 0) : clampInt(v, 0, 3650, 0) };
}
export async function setData(patch: Partial<DataSettings>) {
  const clean: Record<string, any> = {};
  if (patch.retentionDays != null) clean.retentionDays = clampInt(patch.retentionDays, 0, 3650, 0);
  await writeGroup("dataRetention", clean);
  return getData();
}

// ── Exit alerts ───────────────────────────────────────────────────────
// leadDays: raise an exit alert this many days before an instructor's Darwinbox
// last-working-day (default 2). Admin-controlled at /app/settings/exit-alerts.
export type ExitAlertSettings = { leadDays: number };
const DEFAULT_EXIT_ALERTS: ExitAlertSettings = { leadDays: 2 };
export async function getExitAlerts(): Promise<ExitAlertSettings> {
  const e = (await getSettings()).exitAlerts || {};
  return { leadDays: clampInt(e.leadDays, 0, 365, DEFAULT_EXIT_ALERTS.leadDays) };
}
export async function setExitAlerts(patch: Partial<ExitAlertSettings>) {
  const clean: Record<string, any> = {};
  if (patch.leadDays != null) clean.leadDays = clampInt(patch.leadDays, 0, 365, DEFAULT_EXIT_ALERTS.leadDays);
  await writeGroup("exitAlerts", clean);
  return getExitAlerts();
}

// ── Certificates public form ──────────────────────────────────────────
// enabled: form accepts submissions. requireLogin: needs a signed-in session (else the link is enough).
// token: a UUID in the URL (/certifications/<token>) — the form only opens for the exact token, so the
// link is unguessable and can be revoked by regenerating it.
export type CertFormSettings = { enabled: boolean; requireLogin: boolean; token: string };
export async function getCertForm(): Promise<CertFormSettings> {
  const c = (await getSettings()).certForm || {};
  return { enabled: c.enabled !== false, requireLogin: c.requireLogin === true, token: String(c.token || "") };
}
export async function setCertForm(patch: Partial<CertFormSettings>) {
  const clean: Record<string, any> = {};
  if (patch.enabled != null) clean.enabled = !!patch.enabled;
  if (patch.requireLogin != null) clean.requireLogin = !!patch.requireLogin;
  await writeGroup("certForm", clean);
  return getCertForm();
}
// Ensure a token exists (first use); returns the current config.
export async function ensureCertToken(): Promise<CertFormSettings> {
  const c = await getCertForm();
  if (!c.token) { await writeGroup("certForm", { token: randomUUID() }); return getCertForm(); }
  return c;
}
// Mint a NEW token — instantly invalidates any previously shared link.
export async function regenerateCertToken(): Promise<CertFormSettings> {
  await writeGroup("certForm", { token: randomUUID() });
  return getCertForm();
}

// ── Universities (for the CM exit "University Payroll" outcome) ────────
export async function getUniversities(): Promise<string[]> {
  const u = (await getSettings()).universities;
  return Array.isArray(u) ? u.filter((s: any) => typeof s === "string" && s.trim()) : [];
}
export async function setUniversities(list: string[]) {
  const clean = [...new Set((Array.isArray(list) ? list : []).map((s) => String(s || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const doc = await AppSetting.findOneAndUpdate({ key: KEY }, { $set: { universities: clean } }, { new: true, upsert: true });
  cache = doc.toObject(); cacheAt = Date.now();
  return clean;
}
