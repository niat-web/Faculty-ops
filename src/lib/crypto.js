import crypto from "crypto";

// Transparent encryption-at-rest for sensitive field values (AES-256-GCM).
// Opt-in: if ENCRYPTION_KEY is not set, values are stored as plaintext (no-op),
// so dev keeps working. Encrypted values self-identify with an "enc::" prefix,
// so plaintext written before a key existed still decrypts fine (returned as-is).

const PREFIX = "enc::";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept a 64-char hex key or any string (hashed to 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptionEnabled() {
  return Boolean(getKey());
}

export function encrypt(plain) {
  const key = getKey();
  if (key == null || plain == null || plain === "") return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function isEncrypted(v) {
  return typeof v === "string" && v.startsWith(PREFIX);
}

// Decrypt if it's an encrypted blob; otherwise return as-is.
export function maybeDecrypt(v) {
  if (!isEncrypted(v)) return v;
  const key = getKey();
  if (key == null) return v; // key removed — cannot decrypt
  try {
    const [ivB, tagB, dataB] = v.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "••••••"; // tampered / wrong key
  }
}

// --- Password reset tokens ---
export function makeResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
