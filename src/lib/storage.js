import mongoose from "mongoose";
import { connectDB } from "./db.js";

// File storage in MongoDB GridFS — persists across serverless redeploys
// (unlike the local ./uploads folder). Refs look like "gridfs:<id>:<filename>".
// Legacy "uploads/<name>" refs (local disk) are still read for backward compat.

const BUCKET = "uploads";

function guessType(name) {
  const n = String(name).toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

// Persist an uploaded File (from formData). Returns a storage ref string or null.
export async function saveUpload(file, prefix = "file") {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  await connectDB();
  const safe = (file.name || "file").replace(/[^\w.\-]/g, "_");
  const filename = `${prefix}_${safe}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const id = await new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { contentType: file.type || guessType(safe) });
    up.on("error", reject);
    up.on("finish", () => resolve(up.id));
    up.end(buf);
  });
  return `gridfs:${id.toString()}:${filename}`;
}

export function isValidRef(ref) {
  if (typeof ref !== "string") return false;
  if (ref.startsWith("gridfs:")) return /^gridfs:[a-f0-9]{24}:/.test(ref);
  return ref.startsWith("uploads/") && !ref.includes("..");
}

// Read a stored file → { buffer, contentType, filename } or null.
export async function readUpload(ref) {
  if (!isValidRef(ref)) return null;
  if (ref.startsWith("gridfs:")) {
    const [, id, filename] = ref.split(":");
    await connectDB();
    const _id = new mongoose.Types.ObjectId(id);
    try {
      const buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        const dl = bucket().openDownloadStream(_id);
        dl.on("data", (c) => chunks.push(c));
        dl.on("error", reject);
        dl.on("end", () => resolve(Buffer.concat(chunks)));
      });
      return { buffer, contentType: guessType(filename || ""), filename };
    } catch {
      return null;
    }
  }
  // Legacy local-disk file
  try {
    const { promises: fs } = await import("fs");
    const path = (await import("path")).default;
    const buffer = await fs.readFile(path.join(process.cwd(), ref));
    return { buffer, contentType: guessType(ref), filename: ref.split("/").pop() };
  } catch {
    return null;
  }
}
