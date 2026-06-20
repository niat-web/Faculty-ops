import crypto from "crypto";

// AES-256-GCM encryption-at-rest for sensitive field values (opt-in via ENCRYPTION_KEY).
const PREFIX = "enc::";
function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}
export function encryptionEnabled() { return Boolean(getKey()); }

export function encrypt(plain: string | null | undefined) {
  const key = getKey();
  if (key == null || plain == null || plain === "") return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}
export function isEncrypted(v: unknown) { return typeof v === "string" && v.startsWith(PREFIX); }
export function maybeDecrypt(v: any) {
  if (!isEncrypted(v)) return v;
  const key = getKey();
  if (key == null) return v;
  try {
    const [ivB, tagB, dataB] = v.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch { return null; } // decryption failed (wrong/rotated key) — signal failure, don't fake a value
}

export function makeResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
