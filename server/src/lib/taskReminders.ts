// Task reminder intervals (milliseconds). 0 = no recurring reminders.
export const TASK_REMINDER_MS = {
  NONE: 0,
  H1: 60 * 60 * 1000,
  H5: 5 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
} as const;

export const TASK_REMINDER_OPTIONS = [
  { value: TASK_REMINDER_MS.NONE, label: "No reminders" },
  { value: TASK_REMINDER_MS.H1, label: "Every 1 hour" },
  { value: TASK_REMINDER_MS.H5, label: "Every 5 hours" },
  { value: TASK_REMINDER_MS.D1, label: "Every 1 day" },
];

const ALLOWED = new Set<number>(TASK_REMINDER_OPTIONS.map((o) => o.value));

export function normalizeReminderMs(v: any): number {
  const n = Math.round(Number(v));
  return ALLOWED.has(n) ? n : TASK_REMINDER_MS.NONE;
}

export function reminderLabel(ms: number): string {
  return TASK_REMINDER_OPTIONS.find((o) => o.value === ms)?.label || "No reminders";
}

export function fmtTaskDue(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
