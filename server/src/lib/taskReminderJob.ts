import { Task } from "../models";
import { notify } from "./services";
import { fmtTaskDue, reminderLabel } from "./taskReminders";

/** Process recurring reminders for open tasks. Called from /api/cron/reminders (or task-reminders). */
export async function processTaskReminders(): Promise<number> {
  const now = Date.now();
  const tasks = await Task.find({ status: "OPEN", reminderIntervalMs: { $gt: 0 } }).select("title dueAt priority assigneeId reminderIntervalMs lastReminderAt createdAt").lean();
  let sent = 0;

  for (const task of tasks as any[]) {
    const interval = Number(task.reminderIntervalMs);
    if (!interval || interval <= 0) continue;
    const anchor = task.lastReminderAt || task.createdAt;
    if (!anchor) continue;
    if (now - new Date(anchor).getTime() < interval) continue;

    const due = fmtTaskDue(task.dueAt);
    const overdue = new Date(task.dueAt).getTime() < now;
    const bodyLines = [
      task.title,
      `Due: ${due}`,
      `Priority: ${(task.priority || "MEDIUM").toLowerCase()}`,
      `Reminders: ${reminderLabel(interval)}`,
    ];
    await notify(String(task.assigneeId), {
      type: "TASK_REMINDER",
      title: overdue ? `Overdue task: ${task.title}` : `Reminder: ${task.title}`,
      body: bodyLines.join("\n"),
      link: `/app/tasks/${task._id}`,
      emailKey: "TASK_REMINDER",
      email: true,
    });
    await Task.updateOne({ _id: task._id }, { $set: { lastReminderAt: new Date() } });
    sent++;
  }

  return sent;
}
