import mongoose from "mongoose";
import { config } from "./config";
import * as models from "./models";

let connected = false;

export async function connectDB() {
  if (connected) return mongoose.connection;
  mongoose.set("strictQuery", true);

  // Reconnection / resilience logging — Mongoose auto-reconnects the pool;
  // we surface state transitions instead of crashing on a transient blip.
  mongoose.connection.on("error", (e) => console.error("[db] error:", e?.message));
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
  mongoose.connection.on("reconnected", () => console.log("[db] reconnected"));

  // Retry the initial connect a few times so a cold Atlas start doesn't crash-loop.
  let lastErr: any;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 20000, minPoolSize: 2, maxPoolSize: 20, autoIndex: false });
      lastErr = null;
      break;
    } catch (e: any) {
      lastErr = e;
      console.warn(`[db] connect attempt ${attempt}/5 failed: ${e?.message}`);
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
  if (lastErr) throw lastErr;

  connected = true;
  console.log("[db] connected:", mongoose.connection.name);

  // Ensure all declared indexes (incl. the LoginAttempt TTL + unique constraints)
  // actually exist — autoIndex is off, so build them once at startup.
  try {
    await Promise.all(Object.values(models).filter((m: any) => m?.syncIndexes).map((m: any) => m.syncIndexes()));
    console.log("[db] indexes synced");
  } catch (e: any) {
    console.error("[db] index sync failed:", e?.message);
  }

  return mongoose.connection;
}

export async function disconnectDB() {
  if (!connected) return;
  await mongoose.connection.close();
  connected = false;
}
