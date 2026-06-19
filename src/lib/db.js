import mongoose from "mongoose";

// Cache the connection across hot reloads / serverless invocations.
const g = globalThis;
g.__crm = g.__crm || { conn: null, promise: null, mem: null, seeded: false };

async function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  // No URI configured → boot an in-memory MongoDB for local development.
  if (!g.__crm.mem) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    g.__crm.mem = await MongoMemoryServer.create();
    // eslint-disable-next-line no-console
    console.log("[db] Using in-memory MongoDB (no MONGODB_URI set).");
  }
  return g.__crm.mem.getUri();
}

export async function connectDB() {
  if (g.__crm.conn) return g.__crm.conn;
  if (!g.__crm.promise) {
    g.__crm.promise = (async () => {
      const uri = await resolveUri();
      const isReal = !!process.env.MONGODB_URI;
      mongoose.set("strictQuery", true);
      const conn = await mongoose.connect(uri, {
        // Keep a warm pool so reads don't pay a cold-connection cost.
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 20000,
        socketTimeoutMS: 45000,
        // On a real DB, indexes are built by `npm run create-admin` / `npm run seed`,
        // so skip the per-boot autoIndex pass. In-memory dev builds them automatically.
        autoIndex: !isReal,
      });
      return conn;
    })();
  }
  g.__crm.conn = await g.__crm.promise;

  // Auto-seed only the in-memory dev database, and only once.
  if (!process.env.MONGODB_URI && !g.__crm.seeded) {
    g.__crm.seeded = true;
    const { seedIfEmpty } = await import("./seedData.js");
    await seedIfEmpty();
  }
  return g.__crm.conn;
}
