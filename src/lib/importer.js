import Papa from "papaparse";
import { connectDB } from "./db.js";
import { Instructor, FieldDefinition, User } from "../models/index.js";
import { validateValue } from "./services.js";
import { LifecycleStatus, LIFECYCLE_LABEL, Role } from "./enums.js";
import { encrypt } from "./crypto.js";

// Fixed base columns that map to structured instructor fields.
export const BASE_COLUMNS = ["Employee ID", "Name", "Email", "Campus", "Status", "Capability Manager"];

function normalizeStatus(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  if (LifecycleStatus[v]) return v; // already an enum key
  const byLabel = Object.entries(LIFECYCLE_LABEL).find(([, l]) => l.toLowerCase() === v.toLowerCase());
  if (byLabel) return byLabel[0];
  const upper = v.toUpperCase().replace(/[\s-]+/g, "_");
  return LifecycleStatus[upper] || null;
}

// Build the lookup context once (field defs + managers) for validation.
async function buildContext() {
  await connectDB();
  const defs = await FieldDefinition.find({ archivedAt: null, scope: "GLOBAL" }).lean();
  const cms = await User.find({ role: Role.CAPABILITY_MANAGER }).select("name").lean();

  const fieldByHeader = {}; // header label or key (lowercased) -> def
  for (const d of defs) {
    fieldByHeader[d.label.toLowerCase()] = d;
    fieldByHeader[d.key.toLowerCase()] = d;
  }
  const cmByName = {};
  for (const c of cms) cmByName[c.name.trim().toLowerCase()] = String(c._id);

  return { defs, fieldByHeader, cmByName };
}

// Analyze a CSV string. Returns a per-row plan plus summary, without writing.
export async function analyzeCsv(text) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields || [];
  const ctx = await buildContext();

  const knownHeaders = new Set([...BASE_COLUMNS.map((c) => c.toLowerCase())]);
  const unknownColumns = headers.filter(
    (h) => !knownHeaders.has(h.trim().toLowerCase()) && !ctx.fieldByHeader[h.trim().toLowerCase()]
  );

  const employeeIds = parsed.data.map((r) => String(r["Employee ID"] ?? "").trim());
  const existing = await Instructor.find({ employeeId: { $in: employeeIds.filter(Boolean) } })
    .select("employeeId").lean();
  const existingSet = new Set(existing.map((e) => e.employeeId));

  const seen = new Set();
  const rows = parsed.data.map((raw, i) => {
    const rowNum = i + 2; // header is row 1
    const errors = [];
    const warnings = [];
    const employeeId = String(raw["Employee ID"] ?? "").trim();
    const name = String(raw["Name"] ?? "").trim();

    if (!employeeId) errors.push("Missing Employee ID");
    if (seen.has(employeeId) && employeeId) errors.push("Duplicate Employee ID within file");
    seen.add(employeeId);

    const willUpdate = existingSet.has(employeeId);
    if (!willUpdate && !name) errors.push("New instructor requires a Name");

    // status
    let status = null;
    if (raw["Status"] != null && String(raw["Status"]).trim() !== "") {
      status = normalizeStatus(raw["Status"]);
      if (!status) errors.push(`Invalid Status "${raw["Status"]}"`);
    }

    // manager
    let managerId = null;
    const cmRaw = String(raw["Capability Manager"] ?? "").trim();
    if (cmRaw) {
      managerId = ctx.cmByName[cmRaw.toLowerCase()] || null;
      if (!managerId) warnings.push(`Capability Manager "${cmRaw}" not found — will be left unassigned`);
    }

    // dynamic field values + type validation
    const values = {};
    for (const h of headers) {
      const key = h.trim().toLowerCase();
      if (knownHeaders.has(key)) continue;
      const def = ctx.fieldByHeader[key];
      if (!def) continue; // unknown column, skipped
      const val = raw[h];
      if (val == null || String(val).trim() === "") continue;
      const verr = validateValue(def.type, String(val).trim(), { min: def.min, max: def.max, pattern: def.pattern });
      if (verr) errors.push(`${def.label}: ${verr}`);
      else values[def.key] = String(val).trim();
    }

    return {
      rowNum, employeeId, name,
      action: errors.length ? "error" : willUpdate ? "update" : "create",
      errors, warnings,
      data: { employeeId, name, email: String(raw["Email"] ?? "").trim() || null,
        campus: String(raw["Campus"] ?? "").trim() || null, status, managerId, values },
    };
  });

  const summary = {
    total: rows.length,
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    error: rows.filter((r) => r.action === "error").length,
    warnings: rows.filter((r) => r.warnings.length).length,
  };
  return { headers, unknownColumns, rows, summary };
}

// Apply a previously-analyzed CSV. Skips rows with errors.
// Performance: new rows are inserted in one bulk insertMany, audit entries are
// batched, and existing rows are preloaded in a single query (no per-row find).
export async function applyImport(text, actor) {
  const { rows } = await analyzeCsv(text);
  await connectDB();
  let created = 0, updated = 0, skipped = 0;
  const { AuditLog } = await import("../models/index.js");

  const sensitiveDefs = await FieldDefinition.find({ visibility: "SENSITIVE" }).select("key").lean();
  const sensitiveKeys = new Set(sensitiveDefs.map((d) => d.key));
  const enc = (k, v) => (sensitiveKeys.has(k) ? encrypt(v) : v);
  const valuesObj = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, enc(k, v)]));

  const valid = rows.filter((r) => r.action !== "error");
  skipped = rows.length - valid.length;

  // Preload existing instructors in one query.
  const ids = valid.map((r) => r.data.employeeId);
  const existing = await Instructor.find({ employeeId: { $in: ids } });
  const byId = new Map(existing.map((e) => [e.employeeId, e]));

  const toInsert = [];
  const auditDocs = [];

  for (const r of valid) {
    const d = r.data;
    const inst = byId.get(d.employeeId);
    if (!inst) {
      toInsert.push({
        employeeId: d.employeeId, name: d.name || d.employeeId,
        email: d.email, campus: d.campus, status: d.status || "ONBOARDING",
        currentManagerId: d.managerId || null,
        assignments: d.managerId ? [{ managerId: d.managerId, assignedById: actor.id }] : [],
        lifecycle: [{ status: d.status || "ONBOARDING", note: "Imported via CSV", actorId: actor.id, actorName: actor.name }],
        values: valuesObj(d.values),
      });
      created++;
    } else {
      if (d.name) inst.name = d.name;
      if (d.email) inst.email = d.email;
      if (d.campus) inst.campus = d.campus;
      if (d.status && d.status !== inst.status) {
        inst.lifecycle.push({ status: d.status, note: "CSV import", actorId: actor.id, actorName: actor.name });
        inst.status = d.status;
      }
      if (d.managerId && String(inst.currentManagerId) !== d.managerId) {
        const active = inst.assignments.find((a) => !a.endedAt);
        if (active) active.endedAt = new Date();
        inst.assignments.push({ managerId: d.managerId, assignedById: actor.id });
        inst.currentManagerId = d.managerId;
      }
      for (const [k, v] of Object.entries(d.values)) inst.values.set(k, enc(k, v));
      await inst.save();
      updated++;
      auditDocs.push({ instructorId: inst._id, instructorName: inst.name, actorId: actor.id,
        actorName: actor.name, actorRole: actor.role, action: "FIELD_EDIT",
        fieldName: "Bulk import", reason: "CSV import (updated)" });
    }
  }

  if (toInsert.length) {
    const inserted = await Instructor.insertMany(toInsert);
    for (const inst of inserted) {
      auditDocs.push({ instructorId: inst._id, instructorName: inst.name, actorId: actor.id,
        actorName: actor.name, actorRole: actor.role, action: "INSTRUCTOR_CREATE",
        reason: "CSV import", newValue: inst.employeeId });
    }
  }
  if (auditDocs.length) await AuditLog.insertMany(auditDocs);

  return { created, updated, skipped };
}

// Generate a CSV template: base columns + all active global field labels.
export async function buildTemplate() {
  await connectDB();
  const defs = await FieldDefinition.find({ archivedAt: null, scope: "GLOBAL" }).sort({ module: 1 }).lean();
  const headers = [...BASE_COLUMNS, ...defs.map((d) => d.label)];
  const example = ["EMP2001", "Jane Doe", "jane@org.in", "Hyderabad", "Onboarding", "Kiran (Cap Manager)",
    ...defs.map((d) => (d.type === "NUMBER" ? "0" : d.type === "DATE" ? "2026-01-31" : ""))];
  const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return [headers.map(esc).join(","), example.map(esc).join(",")].join("\n");
}
