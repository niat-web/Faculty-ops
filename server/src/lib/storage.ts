// GridFS-backed file storage for instructor documents.
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

let bucket: GridFSBucket | null = null;
function getBucket(): GridFSBucket {
  if (!bucket) bucket = new GridFSBucket(mongoose.connection.db as any, { bucketName: "documents" });
  return bucket;
}

export function uploadBuffer(filename: string, contentType: string, buf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, { contentType });
    stream.on("error", reject);
    stream.on("finish", () => resolve(String(stream.id)));
    stream.end(buf);
  });
}

export function downloadStream(id: string) {
  return getBucket().openDownloadStream(new ObjectId(id));
}

export async function deleteFile(id: string) {
  try { await getBucket().delete(new ObjectId(id)); } catch { /* already gone */ }
}
