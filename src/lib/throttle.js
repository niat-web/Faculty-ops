import { connectDB } from "./db.js";
import { LoginAttempt } from "@/models/index.js";

// Shared (DB-backed) rate-limit / lockout, so it holds across serverless
// instances. After MAX failures within WINDOW, the key is locked for LOCK.
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

export async function isLocked(key) {
  await connectDB();
  const a = await LoginAttempt.findOne({ key }).lean();
  return Boolean(a?.lockedUntil && new Date(a.lockedUntil) > new Date());
}

export async function recordFailure(key) {
  await connectDB();
  const now = Date.now();
  const a = await LoginAttempt.findOne({ key });
  if (!a) {
    await LoginAttempt.create({ key, count: 1, first: new Date(now), updatedAt: new Date(now) });
    return;
  }
  let count = a.count;
  let first = new Date(a.first).getTime();
  if (now - first > WINDOW_MS) { count = 0; first = now; }
  count += 1;
  const upd = { count, first: new Date(first), updatedAt: new Date(now), lockedUntil: a.lockedUntil };
  if (count >= MAX) upd.lockedUntil = new Date(now + LOCK_MS);
  await LoginAttempt.updateOne({ key }, { $set: upd });
}

export async function clearAttempts(key) {
  await connectDB();
  await LoginAttempt.deleteOne({ key });
}
