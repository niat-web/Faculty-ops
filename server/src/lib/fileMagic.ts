// Sniff upload content from magic bytes — do not trust client-provided MIME types alone.
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function sniffMime(buf: Buffer): string | null {
  if (!buf?.length) return null;
  if (buf.length >= 4 && buf.subarray(0, 4).equals(PDF)) return "application/pdf";
  if (buf.length >= 4 && buf.subarray(0, 4).equals(PNG)) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

function mimeMatches(sniffed: string, claimed: string) {
  const c = String(claimed || "").toLowerCase();
  if (sniffed === c) return true;
  if (sniffed === "image/jpeg" && c === "image/jpg") return true;
  return false;
}

/** Returns null when valid, or an error message. */
export function validateUploadBuffer(buf: Buffer, claimedMime: string, allowImages = true): string | null {
  const sniffed = sniffMime(buf);
  if (!sniffed) return "Unrecognized file type.";
  if (sniffed === "application/pdf") return mimeMatches(sniffed, claimedMime) ? null : "File content does not match declared type.";
  if (allowImages && sniffed.startsWith("image/")) {
    const c = String(claimedMime || "").toLowerCase();
    if (!c.startsWith("image/")) return "File content does not match declared type.";
    return mimeMatches(sniffed, claimedMime) ? null : "File content does not match declared type.";
  }
  return "File type not allowed.";
}
