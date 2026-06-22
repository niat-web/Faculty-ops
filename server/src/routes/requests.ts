import { Router } from "express";
import multer from "multer";
import { EditRequest, FieldDefinition, Instructor, User } from "../models";
import { Role } from "../enums";
import { canApproveRequests, canAccessInstructor } from "../lib/rbac";
import { applyFieldChange, notify, writeAudit, validateValue } from "../lib/services";
import { maybeDecrypt } from "../lib/crypto";
import { uploadBuffer, downloadStream, deleteFile } from "../lib/storage";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
// Proof files must be an image or PDF — reject anything else (esp. HTML/SVG → stored XSS). (Bug B3)
const ALLOWED_PROOF = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_PROOF.has(String(file.mimetype || "").toLowerCase())),
});
// Run multer and turn an oversize/other multer error into a clean 400 instead of a 500.
function uploadProof(req: any, res: any, next: any) {
  upload.single("proof")(req, res, (err: any) => (err ? res.status(400).json({ error: err.message || "Upload failed" }) : next()));
}

// List requests relevant to the viewer.
router.get("/", async (req, res) => {
  const u = req.user!;
  const isOps = u.role === Role.OPS_ADMIN;
  const status = String(req.query.status || "").trim();
  const q: any = {};
  if (status) q.status = status;
  // Senior Managers see what they approve AND what they themselves submitted; CMs see their own.
  if (u.role === Role.SENIOR_MANAGER) q.$or = [{ approverId: u.id }, { requesterId: u.id }];
  else if (u.role === Role.CAPABILITY_MANAGER) q.requesterId = u.id;
  // Ops Admin sees all
  const rows = await EditRequest.find(q).sort({ createdAt: -1 }).limit(200).lean();
  res.json({
    requests: rows.map((r: any) => ({
      id: String(r._id), instructorId: String(r.instructorId), instructorName: r.instructorName,
      fieldLabel: r.fieldLabel, oldValue: r.oldValue, newValue: r.newValue, reason: r.reason,
      status: r.status, requesterName: r.requesterName, decisionComment: r.decisionComment,
      proofPath: r.proofPath || null,
      decidable: isOps || String(r.approverId) === u.id, // can THIS viewer approve/reject it
      createdAt: r.createdAt, comments: (r.comments || []).map((c: any) => ({ body: c.body, authorName: c.authorName, createdAt: c.createdAt })),
    })),
  });
});

// Capability Manager submits a change request (with a mandatory proof file) → routed to their Senior Manager.
router.post("/", uploadProof, async (req, res) => {
  const u = req.user!;
  if (!([Role.CAPABILITY_MANAGER, Role.SENIOR_MANAGER, Role.OPS_ADMIN] as string[]).includes(u.role)) return res.status(403).json({ error: "You can't raise requests." });
  const { instructorId, fieldKey, newValue, reason } = req.body || {};
  if (!String(reason || "").trim()) return res.status(400).json({ error: "A reason is required." });
  const proof = (req as any).file; // optional — proof attachments are no longer required
  if (!(await canAccessInstructor(u, instructorId))) return res.status(403).json({ error: "Out of scope" });
  const def: any = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null }).lean();
  if (!def) return res.status(404).json({ error: "Unknown field" });
  // Validate the proposed value at submit time (not just at approval).
  const verr = validateValue(def.type, newValue, { min: def.min, max: def.max, pattern: def.pattern });
  if (verr) return res.status(400).json({ error: verr });
  const inst: any = await Instructor.findById(instructorId).lean();
  if (!inst) return res.status(404).json({ error: "Instructor not found" });

  // Approver routing: CM/Ops → their Senior Manager (or any SM); Senior Manager → an Ops Admin.
  const me: any = await User.findById(u.id).select("managerId").lean();
  const approverId = u.role === Role.SENIOR_MANAGER
    ? (await User.findOne({ role: Role.OPS_ADMIN, active: true, _id: { $ne: u.id } }).select("_id").lean())?._id
    : (me?.managerId || (await User.findOne({ role: Role.SENIOR_MANAGER, active: true }).select("_id").lean())?._id);
  if (!approverId) return res.status(400).json({ error: u.role === Role.SENIOR_MANAGER ? "No Ops Admin available to approve." : "No Senior Manager available to approve." });

  const proofPath = proof ? await uploadBuffer(proof.originalname || "proof", proof.mimetype || "application/octet-stream", proof.buffer) : null;
  let r: any;
  try {
    r = await EditRequest.create({
      instructorId, instructorName: inst.name, fieldKey, fieldLabel: def.label,
      oldValue: maybeDecrypt(inst.values?.[fieldKey]) || "", newValue, reason, proofPath,
      status: "PENDING", requesterId: u.id, requesterName: u.name, approverId,
    });
  } catch (e) { if (proofPath) await deleteFile(proofPath); throw e; } // don't orphan the proof blob
  // Deep link straight to THIS request so the approver lands on exactly the one to review.
  const link = `/app/requests/${r._id}`;
  await notify(String(approverId), { type: "EDIT_REQUEST_SUBMITTED", title: `New edit request from ${u.name}`, body: `${def.label} for ${inst.name}`, link });
  // Also copy Ops Admins (their own on/off toggle), skipping one who is already the approver.
  const ops = await User.find({ role: Role.OPS_ADMIN }).select("_id").lean();
  await Promise.all(ops.filter((o: any) => String(o._id) !== String(approverId)).map((o: any) =>
    notify(String(o._id), { type: "EDIT_REQUEST_SUBMITTED", emailKey: "REQUEST_SUBMITTED_OPS", title: `New edit request from ${u.name}`, body: `${def.label} for ${inst.name}`, link })));
  res.json({ ok: true, id: String(r._id) });
});

// Download the proof file attached to a request (approver / requester / Ops).
router.get("/:id/proof", async (req, res) => {
  const r: any = await EditRequest.findById(req.params.id).lean();
  if (!r || !r.proofPath) return res.status(404).json({ error: "No proof" });
  const u = req.user!;
  const allowed = u.role === Role.OPS_ADMIN || String(r.approverId) === u.id || String(r.requesterId) === u.id;
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  // Force download with a neutral type so an HTML/SVG proof can't render/execute in the browser. (Bug B3)
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  downloadStream(r.proofPath).on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
});

// Senior Manager approves / rejects (the Ops Admin can decide any request as a super-user).
router.post("/:id/decide", async (req, res) => {
  const isOps = req.user!.role === Role.OPS_ADMIN;
  if (!canApproveRequests(req.user!) && !isOps) return res.status(403).json({ error: "Only Senior Managers or the Super Admin can decide" });
  const decision = String(req.body?.decision || "");
  const comment = String(req.body?.comment || "").trim() || null;
  const r: any = await EditRequest.findById(req.params.id);
  if (!r) return res.status(404).json({ error: "Request not found" });
  if (!isOps && String(r.approverId) !== req.user!.id) return res.status(403).json({ error: "Not your request to decide" });
  if (r.status !== "PENDING") return res.status(409).json({ error: "Already decided" });

  if (decision === "APPROVE") {
    await applyFieldChange({ actor: req.user!, instructorId: String(r.instructorId), fieldKey: r.fieldKey, fieldLabel: r.fieldLabel, oldValue: r.oldValue, newValue: r.newValue, reason: r.reason, proofPath: r.proofPath });
    r.status = "APPROVED"; r.decisionComment = comment; r.decidedAt = new Date(); await r.save();
    // Audit the decision itself (who approved), in addition to the field change.
    await writeAudit({ instructorId: r.instructorId, instructorName: r.instructorName, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "REQUEST_DECISION", fieldName: r.fieldLabel, oldValue: r.oldValue, newValue: r.newValue, reason: `Approved${comment ? ": " + comment : ""}` });
    await notify(String(r.requesterId), { type: "EDIT_REQUEST_APPROVED", title: "Your edit request was approved", body: `${r.fieldLabel} → ${r.newValue}`, link: `/app/instructors/${r.instructorId}` });
  } else if (decision === "REJECT") {
    r.status = "REJECTED"; r.decisionComment = comment; r.decidedAt = new Date();
    if (r.proofPath) { await deleteFile(r.proofPath); r.proofPath = null; } // proof no longer needed
    await r.save();
    await writeAudit({ instructorId: r.instructorId, instructorName: r.instructorName, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "REQUEST_DECISION", fieldName: r.fieldLabel, oldValue: r.oldValue, newValue: r.newValue, reason: `Rejected: ${comment || "no comment"}` });
    await notify(String(r.requesterId), { type: "EDIT_REQUEST_REJECTED", title: "Your edit request was rejected", body: comment || "No comment provided", link: `/app/instructors/${r.instructorId}` });
  } else return res.status(400).json({ error: "Bad decision" });
  res.json({ ok: true });
});

// Add a comment to a request.
router.post("/:id/comment", async (req, res) => {
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comment required" });
  const r: any = await EditRequest.findById(req.params.id);
  if (!r) return res.status(404).json({ error: "Request not found" });
  r.comments.push({ body, authorId: req.user!.id, authorName: req.user!.name });
  await r.save();
  // Notify the other party (requester ↔ approver), in-app only.
  const other = String(r.requesterId) === req.user!.id ? r.approverId : r.requesterId;
  if (other) await notify(String(other), { type: "EDIT_REQUEST_SUBMITTED", title: `New comment from ${req.user!.name}`, body: `${r.fieldLabel} for ${r.instructorName}`, link: "/app/requests", email: false });
  res.json({ ok: true });
});

export default router;
