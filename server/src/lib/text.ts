export function escapeRegex(s: string) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export function keyFromLabel(label: string) {
  return String(label).toLowerCase().trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
}
