import { connectDB } from "./db.js";
import { Instructor, FieldDefinition, User, Notification, EditRequest } from "../models/index.js";
import { sendEmail } from "./email.js";

// Scan for upcoming date-based deadlines (training deadlines, certificate expiry,
// probation end, contract renewal) and notify the instructor's Capability Manager.
// Idempotent within a 3-day window so repeated runs don't spam.
const REMINDER_KEY_RE = /deadline|expiry|expiration|renewal|probation|contract/i;

export async function runReminders({ withinDays = 14 } = {}) {
  await connectDB();
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 86400000);

  // Date fields worth reminding about.
  const dateDefs = await FieldDefinition.find({ type: "DATE", archivedAt: null }).lean();
  const relevant = dateDefs.filter((d) => REMINDER_KEY_RE.test(d.key) || REMINDER_KEY_RE.test(d.label));
  if (relevant.length === 0) return { created: 0, scanned: 0, note: "No reminder-relevant date fields defined." };

  const instructors = await Instructor.find({ status: { $nin: ["EXITED"] } })
    .select("name employeeId values currentManagerId").lean();

  let created = 0;
  const since = new Date(now.getTime() - 3 * 86400000);

  for (const inst of instructors) {
    if (!inst.currentManagerId) continue;
    for (const def of relevant) {
      const raw = inst.values?.[def.key];
      if (!raw || isNaN(Date.parse(raw))) continue;
      const when = new Date(raw);
      if (when < now || when > horizon) continue;

      const title = `Upcoming: ${def.label} for ${inst.name}`;
      const body = `${def.label} is due on ${when.toLocaleDateString()} (${inst.employeeId}).`;

      // De-dupe: skip if an identical reminder went out in the last 3 days.
      const dupe = await Notification.findOne({
        userId: inst.currentManagerId, type: "REMINDER", title, createdAt: { $gte: since },
      }).select("_id").lean();
      if (dupe) continue;

      await Notification.create({
        userId: inst.currentManagerId, type: "REMINDER", title, body, link: "/app/instructors",
      });
      const cm = await User.findById(inst.currentManagerId).select("email name emailNotifications").lean();
      if (cm?.email && cm.emailNotifications !== false) {
        await sendEmail({ to: cm.email, subject: title, html: `<p>${body}</p>`, text: body });
      }
      created++;
    }
  }
  return { created, scanned: instructors.length, fields: relevant.map((r) => r.label) };
}

// Weekly digest emailed to each Senior Manager: pending approvals, team size,
// and deadlines coming up across their Capability Managers' reportees.
export async function runDigest({ withinDays = 14 } = {}) {
  await connectDB();
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 86400000);
  const sms = await User.find({ role: "SENIOR_MANAGER", active: true }).lean();

  let sent = 0;
  for (const sm of sms) {
    const cms = await User.find({ managerId: sm._id }).select("_id").lean();
    const cmIds = cms.map((c) => c._id);
    const reportees = await Instructor.find({ currentManagerId: { $in: cmIds } })
      .select("name values").lean();

    const pending = await EditRequest.countDocuments({ approverId: sm._id, status: "PENDING" });
    const dueSoon = reportees.filter((r) => {
      const d = r.values?.track_deadline;
      return d && !isNaN(Date.parse(d)) && new Date(d) >= now && new Date(d) <= horizon;
    });

    const body = `Weekly summary: ${pending} pending approval(s), ${cms.length} capability manager(s), ${reportees.length} instructor(s), ${dueSoon.length} deadline(s) in the next ${withinDays} days.`;
    await Notification.create({ userId: sm._id, type: "REMINDER", title: "Your weekly digest", body, link: "/app" });
    if (sm.email && sm.emailNotifications !== false) {
      const rows = dueSoon.slice(0, 10).map((r) => `<li>${r.name} — ${new Date(r.values.track_deadline).toLocaleDateString()}</li>`).join("");
      sendEmail({
        to: sm.email,
        subject: "FacultyOps — your weekly digest",
        html: `<p>Hi ${sm.name},</p><p>${body}</p>${rows ? `<p>Upcoming deadlines:</p><ul>${rows}</ul>` : ""}<p><a href="${(process.env.APP_URL || "")}/app">Open dashboard</a></p>`,
        text: body,
      }).catch((e) => console.error("[digest] email failed:", e?.message));
    }
    sent++;
  }
  return { digestsSent: sent };
}
