// Seed a real MongoDB (set MONGODB_URI). For local dev with no URI, the app
// auto-seeds an in-memory database on first request — you don't need this.
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import mongoose from "mongoose";

// Minimal .env loader (no extra dependency).
try {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Local dev auto-seeds an in-memory DB — just run `npm run dev`.");
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const { forceSeed } = await import(pathToFileURL(path.join(dir, "..", "src", "lib", "seedData.js")).href);

const res = await forceSeed();
console.log("Seed complete:", res);
console.log("Accounts (password: 'password'): ops@org.in, sm1@org.in, cm1@org.in …");
await mongoose.disconnect();
process.exit(0);
