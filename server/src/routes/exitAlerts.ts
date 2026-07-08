import { Router } from "express";
import { ExitAlert, Instructor } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { writeAudit } from "../lib/services";
import { daysUntil } from "../lib/exitAlerts";

const router = Router();
router.use(requireUser());

const RESOLUTIONS = {
  UNIVERSITY_PAYROLL: "Moved to NxtWave University Payroll",
  EXITED: "Exited the organization",
  CONSULTANT_REHIRE: "Exited as Consultant, rejoined as Full-Time Employee",
} as const;
type Resolution = keyof typeof RESOLUTIONS;

const canSeeAll = (role: string) => role === Role.OPS_ADMIN || role === Role.SENIOR_MANAGER;

function serialize(a: any) {
  return {
    id: String(a._id),
    instructorId: a.instructorId ? String(a.instructorId) : null,
    employeeId: a.employeeId,
    name: a.name,
    email: a.email || "",
    role: a.role || "",
    mobile: a.mobile || "",
    department: a.department || "",
    managerId: a.managerId ? String(a.managerId) : null,
    managerName: a.managerName || "",
    exitDate: a.exitDate,
    daysUntil: daysUntil(a.exitDate),
    status: a.status,
    resolution: a.resolution || null,
    resolutionLabel: a.resolution ? (RESOLUTIONS as any)[a.resolution] || a.resolution : null,
    resolvedByName: a.resolvedByName || null,
    resolvedAt: a.resolvedAt || null,
    createdAt: a.createdAt,
  };
}

// List exit alerts scoped to the caller.
//  - Ops Admin / Senior Manager: every alert (default: only PENDING).
//  - Capability Manager: only alerts for instructors reporting to them.
//  - Instructor: none.
router.get("/", async (req, res) => {
  const u = req.user!;
  if (u.role === Role.INSTRUCTOR) return res.json({ items: [], canResolve: false });
  const includeResolved = String(req.query.all || "") === "1";
  const filter: any = {};
  if (!includeResolved) filter.status = "PENDING";
  if (u.role === Role.CAPABILITY_MANAGER) filter.managerId = u.id;
  else if (!canSeeAll(u.role)) return res.json({ items: [], canResolve: false });
  const rows = await ExitAlert.find(filter).sort({ exitDate: 1, createdAt: -1 }).limit(500).lean();
  // Only the Capability Manager the instructor reports to (or an Ops Admin) finalises the outcome.
  const canResolve = u.role === Role.CAPABILITY_MANAGER || u.role === Role.OPS_ADMIN;
  const { getUniversities } = await import("../lib/settings");
  res.json({ items: rows.map(serialize), canResolve, universities: await getUniversities() });
});

// Unread/pending count for the caller (banner + polling).
router.get("/count", async (req, res) => {
  const u = req.user!;
  if (u.role === Role.INSTRUCTOR) return res.json({ count: 0 });
  const filter: any = { status: "PENDING" };
  if (u.role === Role.CAPABILITY_MANAGER) filter.managerId = u.id;
  else if (!canSeeAll(u.role)) return res.json({ count: 0 });
  res.json({ count: await ExitAlert.countDocuments(filter) });
});

// Finalise an exit alert (Capability Manager for their own reportee, or Ops Admin for any).
router.post("/:id/resolve", async (req, res) => {
  const u = req.user!;
  if (u.role !== Role.CAPABILITY_MANAGER && u.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const resolution = String(req.body?.resolution || "") as Resolution;
  if (!RESOLUTIONS[resolution]) return res.status(400).json({ error: "Choose a valid exit outcome." });
  const note = String(req.body?.note || "").trim().slice(0, 500);
  const university = String(req.body?.university || "").trim().slice(0, 120);
  if (resolution === "UNIVERSITY_PAYROLL" && !university) return res.status(400).json({ error: "Select the university name." });

  const alert: any = await ExitAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ error: "Not found" });
  if (alert.status === "RESOLVED") return res.status(409).json({ error: "This exit has already been finalised." });
  // A Capability Manager may only resolve their own reportee's alert.
  if (u.role === Role.CAPABILITY_MANAGER && String(alert.managerId || "") !== String(u.id)) {
    return res.status(403).json({ error: "This instructor doesn't report to you." });
  }

  // Apply the chosen outcome. Auto-create a minimal record if this employee only existed live in
  // Darwinbox, so "Actually exited" can surface on the Instructor Exited page.
  let inst: any = alert.instructorId ? await Instructor.findById(alert.instructorId) : await Instructor.findOne({ employeeId: alert.employeeId });
  if (!inst) {
    const emailTaken = alert.email ? await Instructor.findOne({ email: alert.email }).select("_id").lean() : null;
    inst = await Instructor.create({ employeeId: alert.employeeId, name: alert.name || alert.employeeId, email: emailTaken ? null : (alert.email || null), status: "ONBOARDING", values: {} });
    alert.instructorId = inst._id;
  }
  const from = inst.status;
  if (resolution === "EXITED") {
    // Real exit → leaves the Master, appears on Instructor Exited.
    inst.status = "EXITED";
    inst.exit = inst.exit || {};
    inst.exit.lastWorkingDay = alert.exitDate;
    inst.exit.typeOfExit = inst.exit.typeOfExit || "Exit";
    inst.values.set("exit_date", alert.exitDate);
  } else if (resolution === "UNIVERSITY_PAYROLL") {
    // Not an exit — moved to a University payroll entity. Stays on the Master; Payroll = University,
    // Workspace = the chosen university.
    inst.values.set("payroll_entity", "University");
    if (university) inst.values.set("workspace", university);
    inst.values.set("exit_date", "");
    if (inst.exit) inst.exit.lastWorkingDay = null;
    if (["EXITED", "EXIT_IN_PROGRESS"].includes(inst.status)) inst.status = "CONFIRMED";
  } else if (resolution === "CONSULTANT_REHIRE") {
    // Exited as consultant, rejoined FTE → stays on the Master.
    inst.status = "REHIRED";
    inst.values.set("exit_date", "");
    if (inst.exit) inst.exit.lastWorkingDay = null;
  }
  const statusChange: { from: string; to: string } | null = inst.status !== from ? { from, to: inst.status } : null;
  inst.lifecycle.push({ status: inst.status, note: `Exit finalised: ${RESOLUTIONS[resolution]}${note ? ` — ${note}` : ""}`, actorId: u.id, actorName: u.name });
  await inst.save();

  alert.status = "RESOLVED";
  alert.resolution = resolution;
  alert.university = resolution === "UNIVERSITY_PAYROLL" ? university : null;
  alert.resolutionNote = note || null;
  alert.resolvedById = u.id;
  alert.resolvedByName = u.name;
  alert.resolvedAt = new Date();
  await alert.save();

  await writeAudit({
    instructorId: alert.instructorId || null, instructorName: alert.name,
    actorId: u.id, actorName: u.name, actorRole: u.role,
    action: "LIFECYCLE_CHANGE", fieldName: "Exit outcome",
    oldValue: statusChange?.from || null, newValue: RESOLUTIONS[resolution],
    reason: note || "Exit alert finalised",
  });

  res.json({ ok: true, alert: serialize(alert.toObject()) });
});

export default router;
