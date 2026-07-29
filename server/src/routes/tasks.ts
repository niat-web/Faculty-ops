import { Router } from "express";
import mongoose from "mongoose";
import { Task, User, Instructor } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { getTasksSettings } from "../lib/settings";
import { canAccessInstructor, instructorScopeFilter } from "../lib/rbac";
import { canAssignTasks, canDeleteTask, canMarkDone, canViewTask } from "../lib/taskScope";
import { notify, writeAudit } from "../lib/services";
import { escapeRegex } from "../lib/text";

const router = Router();
router.use(requireUser());
router.param("id", (req, res, next, id) => (mongoose.isValidObjectId(id) ? next() : res.status(400).json({ error: "Invalid id" })));

function mapTask(t: any) {
  return {
    id: String(t._id),
    title: t.title,
    body: t.body || "",
    status: t.status,
    dueAt: t.dueAt,
    assignerId: String(t.assignerId),
    assignerName: t.assignerName,
    assignerRole: t.assignerRole,
    assigneeId: String(t.assigneeId),
    assigneeName: t.assigneeName,
    assigneeRole: t.assigneeRole,
    instructorId: t.instructorId ? String(t.instructorId) : null,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

type Assignee = { userId: string; name: string; role: string; instructorId?: string };

router.get("/meta", async (req, res) => {
  const u = req.user!;
  const settings = await getTasksSettings();
  const canAssign = await canAssignTasks(u);
  res.json({
    canAssign,
    isOps: u.role === Role.OPS_ADMIN,
    cmCanAssignToInstructors: settings.cmCanAssignToInstructors,
    seniorManagerCanAssign: settings.seniorManagerCanAssign,
    assignRoles: u.role === Role.OPS_ADMIN ? [Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER, Role.INSTRUCTOR] : [],
  });
});

router.get("/count", async (req, res) => {
  const open = await Task.countDocuments({ assigneeId: req.user!.id, status: "OPEN" });
  res.json({ open });
});

router.get("/assign-options", async (req, res) => {
  const u = req.user!;
  if (!(await canAssignTasks(u))) return res.status(403).json({ error: "Forbidden" });

  if (u.role === Role.OPS_ADMIN) {
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
  let q: Record<string, any> = {};

  if (u.role === Role.OPS_ADMIN && view === "all") {
    q = {};
  } else if (view === "assigned") {
    q = { assignerId: u.id };
  } else {
    q = { assigneeId: u.id };
  }
  if (status) q.status = status;

  const rows = await Task.find(q).sort({ dueAt: 1, createdAt: -1 }).limit(300).lean();
  res.json({ tasks: rows.map(mapTask) });
});

async function resolveInstructorAssignee(instructorId: string): Promise<Assignee | null> {
  const inst: any = await Instructor.findById(instructorId).select("name email").lean();
  if (!inst?.email) return null;
  const usr: any = await User.findOne({ email: inst.email.toLowerCase(), role: Role.INSTRUCTOR, active: true }).select("name role").lean();
  if (!usr) return null;
  return { userId: String(usr._id), name: inst.name, role: Role.INSTRUCTOR, instructorId };
}

router.post("/", async (req, res) => {
  const u = req.user!;
  if (!(await canAssignTasks(u))) return res.status(403).json({ error: "You can't assign tasks." });

  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  const dueAtRaw = req.body?.dueAt;
  if (!title) return res.status(400).json({ error: "Task description is required." });
  if (!dueAtRaw) return res.status(400).json({ error: "Due date and time are required." });
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) return res.status(400).json({ error: "Invalid due date." });

  const targetType = String(req.body?.targetType || "USER");
  const assignees: Assignee[] = [];

  if (u.role === Role.OPS_ADMIN) {
    if (targetType === "ROLE") {
      const role = String(req.body?.role || "");
      if (!([Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER, Role.INSTRUCTOR] as string[]).includes(role)) {
        return res.status(400).json({ error: "Invalid role." });
      }
      const users = await User.find({ role, active: true }).select("_id name role").lean();
      assignees.push(...users.map((usr) => ({ userId: String(usr._id), name: usr.name, role: usr.role })));
    } else if (targetType === "USER") {
      const userId = String(req.body?.userId || "");
      if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "Select a recipient." });
      const usr: any = await User.findById(userId).lean();
      if (!usr?.active) return res.status(404).json({ error: "User not found." });
      assignees.push({ userId: String(usr._id), name: usr.name, role: usr.role });
    } else if (targetType === "INSTRUCTORS") {
      const ids: string[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds.map(String) : [];
      for (const iid of ids) {
        const a = await resolveInstructorAssignee(iid);
        if (a) assignees.push(a);
      }
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
    const ids: string[] = Array.isArray(req.body?.instructorIds)
      ? req.body.instructorIds.map(String)
      : req.body?.instructorId
        ? [String(req.body.instructorId)]
        : req.body?.userId
          ? []
          : [];
    if (req.body?.userId && mongoose.isValidObjectId(req.body.userId)) {
      const usr: any = await User.findById(req.body.userId).lean();
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
      body,
      dueAt,
      status: "OPEN",
      assignerId: u.id,
      assignerName: u.name,
      assignerRole: u.role,
      assigneeId: a.userId,
      assigneeName: a.name,
      assigneeRole: a.role,
      instructorId: a.instructorId || null,
    });
    await notify(a.userId, {
      type: "TASK_ASSIGNED",
      title: "New task assigned",
      body: title,
      link: "/app/tasks",
      emailKey: "TASK_ASSIGNED",
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
        body: task.title,
        link: "/app/tasks?view=assigned",
        emailKey: "TASK_COMPLETED",
      });
    }
    return res.json({ task: mapTask(task.toObject()) });
  }

  if (u.role === Role.OPS_ADMIN) {
    if (req.body?.title != null) task.title = String(req.body.title).trim().slice(0, 500);
    if (req.body?.body != null) task.body = String(req.body.body).slice(0, 2000);
    if (req.body?.dueAt) {
      const d = new Date(req.body.dueAt);
      if (!Number.isNaN(d.getTime())) task.dueAt = d;
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
