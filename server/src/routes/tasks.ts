import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { Task, User, Instructor } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { getTasksSettings } from "../lib/settings";
import { canAccessInstructor, instructorScopeFilter } from "../lib/rbac";
import { canAssignTasks, canDeleteTask, canMarkDone, canViewTask } from "../lib/taskScope";
import { isOpsLevel } from "../lib/rbac";
import { notify, writeAudit, notifyTaskAssigned } from "../lib/services";
import { normalizeReminderMs, reminderLabel, TASK_REMINDER_OPTIONS } from "../lib/taskReminders";
import { escapeRegex } from "../lib/text";
import { uploadCertificate, driveConfigured } from "../lib/drive";
import { validateUploadBuffer } from "../lib/fileMagic";

const router = Router();
router.use(requireUser());
router.param("id", (req, res, next, id) => (mongoose.isValidObjectId(id) ? next() : res.status(400).json({ error: "Invalid id" })));

const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const taskUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
function parseLabels(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  try { const p = JSON.parse(String(raw || "[]")); return Array.isArray(p) ? p.map((s) => String(s).trim()).filter(Boolean).slice(0, 10) : []; } catch { return []; }
}

function mapComment(c: any) {
  return {
    id: String(c._id),
    body: c.body,
    authorId: String(c.authorId),
    authorName: c.authorName,
    authorRole: c.authorRole,
    createdAt: c.createdAt,
  };
}

function mapTask(t: any, { includeComments = false } = {}) {
  const out: any = {
    id: String(t._id),
    title: t.title,
    body: t.body || "",
    status: t.status,
    priority: t.priority || "MEDIUM",
    dueAt: t.dueAt,
    assignerId: String(t.assignerId),
    assignerName: t.assignerName,
    assignerRole: t.assignerRole,
    assigneeId: String(t.assigneeId),
    assigneeName: t.assigneeName,
    assigneeRole: t.assigneeRole,
    instructorId: t.instructorId ? String(t.instructorId) : null,
    completedAt: t.completedAt,
    commentCount: Array.isArray(t.comments) ? t.comments.length : 0,
    reminderIntervalMs: t.reminderIntervalMs || 0,
    reminderLabel: reminderLabel(t.reminderIntervalMs || 0),
    lastReminderAt: t.lastReminderAt,
    deadlineAt: t.deadlineAt || null,
    labels: Array.isArray(t.labels) ? t.labels : [],
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (includeComments) out.comments = (t.comments || []).map(mapComment);
  return out;
}

type Assignee = { userId: string; name: string; role: string; instructorId?: string };

router.get("/meta", async (req, res) => {
  const u = req.user!;
  const settings = await getTasksSettings();
  const canAssign = await canAssignTasks(u);
  res.json({
    canAssign,
    isOps: isOpsLevel(u),
    cmCanAssignToInstructors: settings.cmCanAssignToInstructors,
    seniorManagerCanAssign: settings.seniorManagerCanAssign,
    assignRoles: isOpsLevel(u) ? [Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER, Role.INSTRUCTOR] : [],
    reminderOptions: TASK_REMINDER_OPTIONS,
  });
});

router.get("/count", async (req, res) => {
  const open = await Task.countDocuments({ assigneeId: req.user!.id, status: "OPEN" });
  res.json({ open });
});

router.get("/assign-options", async (req, res) => {
  const u = req.user!;
  if (!(await canAssignTasks(u))) return res.status(403).json({ error: "Forbidden" });

  if (isOpsLevel(u)) {
    const role = String(req.query.role || "").trim();
    const q = String(req.query.q || "").trim();
    const filter: any = { active: true };
    if (role) filter.role = role;
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const users = await User.find(filter).select("name email role").sort({ name: 1 }).limit(100).lean();
    return res.json({ users: users.map((usr) => ({ id: String(usr._id), name: usr.name, email: usr.email, role: usr.role })) });
  }

  if (u.role === Role.CAPABILITY_MANAGER || u.role === Role.SENIOR_MANAGER) {
    const filter = instructorScopeFilter(u);
    const instructors = await Instructor.find(filter).select("name email employeeId").sort({ name: 1 }).limit(500).lean();
    const emails = instructors.map((i) => (i.email || "").toLowerCase()).filter(Boolean);
    const users = emails.length
      ? await User.find({ email: { $in: emails }, role: Role.INSTRUCTOR, active: true }).select("name email").lean()
      : [];
    const userByEmail = Object.fromEntries(users.map((usr) => [(usr.email || "").toLowerCase(), usr]));
    const items = instructors.map((inst) => {
      const usr = userByEmail[(inst.email || "").toLowerCase()];
      return {
        instructorId: String(inst._id),
        name: inst.name,
        employeeId: inst.employeeId,
        userId: usr ? String(usr._id) : null,
        hasLogin: !!usr,
      };
    });
    return res.json({ instructors: items });
  }

  res.json({ users: [], instructors: [] });
});

router.get("/", async (req, res) => {
  const u = req.user!;
  const view = String(req.query.view || "mine");
  const status = String(req.query.status || "").trim();
  const qText = String(req.query.q || "").trim();
  let filter: Record<string, any> = {};

  if (isOpsLevel(u) && view === "all") {
    filter = {};
  } else if (view === "assigned") {
    filter = { assignerId: u.id };
  } else {
    filter = { assigneeId: u.id };
  }
  if (status) filter.status = status;
  if (qText) {
    const rx = new RegExp(escapeRegex(qText), "i");
    filter.$or = [{ title: rx }, { body: rx }];
  }

  const rows = await Task.find(filter).sort({ dueAt: 1, createdAt: -1 }).limit(300).lean();
  res.json({ tasks: rows.map((t) => mapTask(t)) });
});

router.get("/:id", async (req, res) => {
  const task: any = await Task.findById(req.params.id).lean();
  if (!task) return res.status(404).json({ error: "Not found" });
  if (!canViewTask(req.user!, task)) return res.status(403).json({ error: "Forbidden" });
  res.json({ task: mapTask(task, { includeComments: true }) });
});

async function resolveInstructorAssignee(instructorId: string): Promise<Assignee | null> {
  const inst: any = await Instructor.findById(instructorId).select("name email").lean();
  if (!inst?.email) return null;
  const usr: any = await User.findOne({ email: inst.email.toLowerCase(), role: Role.INSTRUCTOR, active: true }).select("name role").lean();
  if (!usr) return null;
  return { userId: String(usr._id), name: inst.name, role: Role.INSTRUCTOR, instructorId };
}

router.post("/", taskUpload.single("attachment"), async (req, res) => {
  const u = req.user!;
  if (!(await canAssignTasks(u))) return res.status(403).json({ error: "You can't assign tasks." });

  const b = req.body || {};
  const title = String(b.title || "").trim();
  const body = String(b.body || "").trim();
  const dueAtRaw = b.dueAt;
  const priority = String(b.priority || "MEDIUM").toUpperCase();
  const reminderIntervalMs = normalizeReminderMs(b.reminderIntervalMs);
  const labels = parseLabels(b.labels);
  let deadlineAt: Date | null = null;
  if (b.deadlineAt) {
    const d = new Date(b.deadlineAt);
    if (!Number.isNaN(d.getTime())) deadlineAt = d;
  }
  if (!title) return res.status(400).json({ error: "Task description is required." });
  if (!dueAtRaw) return res.status(400).json({ error: "Due date and time are required." });
  if (!PRIORITIES.has(priority)) return res.status(400).json({ error: "Invalid priority." });
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) return res.status(400).json({ error: "Invalid due date." });

  let attachments: { name: string; url: string; mime: string }[] = [];
  const file = (req as any).file;
  if (file) {
    const issue = validateUploadBuffer(file.buffer, file.mimetype || "");
    if (issue) return res.status(400).json({ error: issue });
    if (!driveConfigured()) return res.status(400).json({ error: "File uploads require Google Drive to be configured." });
    try {
      const { link } = await uploadCertificate(file.buffer, file.originalname || "attachment", file.mimetype || "application/octet-stream");
      attachments = [{ name: file.originalname || "attachment", url: link, mime: file.mimetype || "" }];
    } catch (e: any) {
      return res.status(502).json({ error: e?.message || "Attachment upload failed." });
    }
  }

  const targetType = String(b.targetType || "USER");
  const assignees: Assignee[] = [];

  if (isOpsLevel(u)) {
    if (targetType === "ROLE") {
      const role = String(b.role || "");
      if (!([Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER, Role.INSTRUCTOR] as string[]).includes(role)) {
        return res.status(400).json({ error: "Invalid role." });
      }
      const users = await User.find({ role, active: true }).select("_id name role").lean();
      assignees.push(...users.map((usr) => ({ userId: String(usr._id), name: usr.name, role: usr.role })));
    } else if (targetType === "USER") {
      const userId = String(b.userId || "");
      if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "Select a recipient." });
      const usr: any = await User.findById(userId).lean();
      if (!usr?.active) return res.status(404).json({ error: "User not found." });
      assignees.push({ userId: String(usr._id), name: usr.name, role: usr.role });
    } else {
      return res.status(400).json({ error: "Invalid target type." });
    }
  } else if (u.role === Role.CAPABILITY_MANAGER || u.role === Role.SENIOR_MANAGER) {
    const settings = await getTasksSettings();
    if (u.role === Role.CAPABILITY_MANAGER && !settings.cmCanAssignToInstructors) {
      return res.status(403).json({ error: "Capability Managers can't assign tasks." });
    }
    if (u.role === Role.SENIOR_MANAGER && !settings.seniorManagerCanAssign) {
      return res.status(403).json({ error: "Senior Managers can't assign tasks." });
    }
    const ids: string[] = Array.isArray(b.instructorIds)
      ? b.instructorIds.map(String)
      : b.instructorId
        ? [String(b.instructorId)]
        : [];
    if (b.userId && mongoose.isValidObjectId(b.userId)) {
      const usr: any = await User.findById(b.userId).lean();
      if (usr?.active && usr.role === Role.INSTRUCTOR) {
        assignees.push({ userId: String(usr._id), name: usr.name, role: usr.role });
      }
    }
    for (const iid of ids) {
      if (!mongoose.isValidObjectId(iid)) continue;
      if (!(await canAccessInstructor(u, iid))) return res.status(403).json({ error: "Instructor out of scope." });
      const a = await resolveInstructorAssignee(iid);
      if (a) assignees.push(a);
    }
  }

  if (!assignees.length) return res.status(400).json({ error: "No valid recipients — ensure selected people have active login accounts." });

  const created: any[] = [];
  for (const a of assignees) {
    const doc = await Task.create({
      title,
      body: body || title,
      dueAt,
      priority,
      status: "OPEN",
      reminderIntervalMs,
      lastReminderAt: null,
      deadlineAt,
      labels,
      attachments,
      assignerId: u.id,
      assignerName: u.name,
      assignerRole: u.role,
      assigneeId: a.userId,
      assigneeName: a.name,
      assigneeRole: a.role,
      instructorId: a.instructorId || null,
      comments: [],
    });
    await notifyTaskAssigned(a.userId, {
      id: String(doc._id),
      title,
      dueAt,
      priority,
      assignerName: u.name,
      reminderIntervalMs,
      createdAt: doc.createdAt || new Date(),
    });
    created.push(mapTask(doc.toObject()));
  }

  await writeAudit({
    actorId: u.id,
    actorName: u.name,
    actorRole: u.role,
    action: "TASK_CREATE",
    fieldName: "Task",
    newValue: `${created.length} task(s): ${title.slice(0, 80)}`,
    reason: `Assigned to ${assignees.length} recipient(s)`,
  });

  res.json({ tasks: created, count: created.length });
});

router.post("/:id/comments", async (req, res) => {
  const task: any = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "Not found" });
  const u = req.user!;
  if (!canViewTask(u, task)) return res.status(403).json({ error: "Forbidden" });

  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comment can't be empty." });

  task.comments.push({
    body: body.slice(0, 2000),
    authorId: u.id,
    authorName: u.name,
    authorRole: u.role,
  });
  await task.save();
  const saved = task.comments[task.comments.length - 1];
  res.json({ comment: mapComment(saved.toObject ? saved.toObject() : saved) });
});

router.patch("/:id", async (req, res) => {
  const task: any = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "Not found" });
  const u = req.user!;
  if (!canViewTask(u, task)) return res.status(403).json({ error: "Forbidden" });

  const status = String(req.body?.status || "");
  if (status === "DONE") {
    if (!canMarkDone(u, task)) return res.status(403).json({ error: "Forbidden" });
    task.status = "DONE";
    task.completedAt = new Date();
    await task.save();
    if (String(task.assignerId) !== u.id) {
      await notify(String(task.assignerId), {
        type: "TASK_COMPLETED",
        title: "Task completed",
        body: [`${task.title}`, `Completed by: ${u.name}`, `Completed at: ${new Date().toLocaleString()}`].join("\n"),
        link: `/app/tasks/${task._id}`,
        emailKey: "TASK_COMPLETED",
        email: true,
      });
    }
    return res.json({ task: mapTask(task.toObject()) });
  }

  if (status === "OPEN" && task.status === "DONE" && canMarkDone(u, task)) {
    task.status = "OPEN";
    task.completedAt = null;
    await task.save();
    return res.json({ task: mapTask(task.toObject()) });
  }

  if (isOpsLevel(u) || String(task.assignerId) === u.id) {
    if (req.body?.title != null) task.title = String(req.body.title).trim().slice(0, 500);
    if (req.body?.body != null) task.body = String(req.body.body).slice(0, 2000);
    if (req.body?.dueAt) {
      const d = new Date(req.body.dueAt);
      if (!Number.isNaN(d.getTime())) task.dueAt = d;
    }
    if (req.body?.priority) {
      const p = String(req.body.priority).toUpperCase();
      if (PRIORITIES.has(p)) task.priority = p;
    }
    if (status === "CANCELLED" || status === "OPEN") task.status = status;
    await task.save();
    return res.json({ task: mapTask(task.toObject()) });
  }

  return res.status(400).json({ error: "Nothing to update." });
});

router.delete("/:id", async (req, res) => {
  const task: any = await Task.findById(req.params.id).lean();
  if (!task) return res.status(404).json({ error: "Not found" });
  if (!canDeleteTask(req.user!, task)) return res.status(403).json({ error: "Forbidden" });
  await Task.deleteOne({ _id: task._id });
  await writeAudit({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: "TASK_DELETE",
    fieldName: "Task",
    oldValue: task.title,
    reason: "Task deleted",
  });
  res.json({ ok: true });
});

export default router;
