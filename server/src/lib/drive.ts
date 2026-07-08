import fs from "fs";
import path from "path";
import { GoogleAuth } from "google-auth-library";
import { config } from "../config";

// Google Drive uploads for certificate files. Uses the SAME service account as BigQuery
// (GOOGLE_APPLICATION_CREDENTIALS) with the Drive scope, and drops every file into one
// Shared-Drive folder (GDRIVE_CERTIFICATES_FOLDER_ID), then makes it "anyone with the link (viewer)"
// so the stored link opens for anyone. A service account can only write into a Shared Drive it is a
// member of (add the SA email as a Content manager), which is why a Shared Drive folder is required.

// GOOGLE_APPLICATION_CREDENTIALS may be a file PATH (local), inline JSON, or base64 JSON (cloud).
function credentialOpts(raw: string): { keyFile?: string; credentials?: any } {
  const cred = String(raw || "").trim();
  let jsonText = "";
  if (cred.startsWith("{")) jsonText = cred;
  else if (cred.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(cred)) {
    try { const decoded = Buffer.from(cred, "base64").toString("utf8"); if (decoded.trim().startsWith("{")) jsonText = decoded; } catch { /* not base64 */ }
  }
  if (jsonText) {
    try { return { credentials: JSON.parse(jsonText) }; }
    catch { throw new Error("Google credentials JSON is invalid (base64 is recommended)."); }
  }
  const keyFile = path.resolve(process.cwd(), cred);
  if (!fs.existsSync(keyFile)) throw new Error(`Google credentials file not found at ${keyFile}.`);
  return { keyFile };
}

let _auth: GoogleAuth | null = null;
function auth(): GoogleAuth {
  if (_auth) return _auth;
  const opts: any = { scopes: ["https://www.googleapis.com/auth/drive"] };
  Object.assign(opts, credentialOpts(config.googleCredentials));
  _auth = new GoogleAuth(opts);
  return _auth;
}

async function accessToken(): Promise<string> {
  const client = await auth().getClient();
  const t = await client.getAccessToken();
  const token = typeof t === "string" ? t : t?.token;
  if (!token) throw new Error("Could not obtain a Google access token.");
  return token;
}

export function driveConfigured(): boolean {
  return Boolean(config.googleCredentials && config.driveCertFolderId);
}

export type DriveFile = { id: string; link: string };

// Upload a buffer to the certificates folder and return its shareable link.
export async function uploadCertificate(buffer: Buffer, filename: string, mimeType: string): Promise<DriveFile> {
  if (!driveConfigured()) throw new Error("Google Drive isn't configured (set GOOGLE_APPLICATION_CREDENTIALS + GDRIVE_CERTIFICATES_FOLDER_ID, and add the service account to the Shared Drive).");
  const token = await accessToken();
  const folderId = config.driveCertFolderId;

  // Multipart upload (metadata + file) → Drive v3, with Shared-Drive support.
  const boundary = "faculty-" + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [folderId] };
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`;
  const post = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(pre, "utf8"), buffer, Buffer.from(post, "utf8")]);

  const upRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data: any = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !data?.id) throw new Error(`Drive upload failed (HTTP ${upRes.status}): ${data?.error?.message || "unknown error"}`);

  // Make it "anyone with the link → viewer" so the stored link opens for everyone.
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
  } catch { /* permission may be inherited from the Shared Drive; ignore */ }

  return { id: data.id, link: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view` };
}
