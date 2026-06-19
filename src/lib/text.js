// Escape user input before using it inside a MongoDB $regex, so characters like
// ( [ * ? can't break the query (HTTP 500) or create a ReDoS.
export function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Escape user-supplied values interpolated into notification email HTML.
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
