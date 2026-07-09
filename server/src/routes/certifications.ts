import { Router } from "express";
import multer from "multer";
import { Certification } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { uploadCertificate, driveConfigured } from "../lib/drive";

// Public "Certificates" form + admin management. The form is now SCHEMA-DRIVEN — an Ops Admin edits the
// sections/fields/types/options/order in the builder and the public form + submissions table follow.
//  - /config, /employee-search, /submit are PUBLIC (gated by the admin's enabled/requireLogin toggle).
//  - the rest require an Ops Admin (list, settings, schema) or any staff (profile display).

const router = Router();
// Accept images + PDFs (the realistic certificate formats), up to 15MB, under ANY field name (the form
// is dynamic, so file field names come from the schema).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mt = String(file.mimetype || "");
    if (mt.startsWith("image/") || mt === "application/pdf") return cb(null, true);
    cb(new Error("Only image or PDF files are allowed."));
  },
});
function uploadAny(req: any, res: any, next: any) {
  upload.any()(req, res, (err: any) => (err ? res.status(400).json({ error: err.message || "Upload failed." }) : next()));
}
const clean = (v: any) => String(v ?? "").trim();

// Gate the public endpoints: the URL token (?token=<uuid>) must match the stored one, plus the admin toggles.
async function formGate(req: any, res: any, next: any) {
  const { getCertForm } = await import("../lib/settings");
  const cfg = await getCertForm();
  const token = String(req.query.token || req.body?.token || "");
  if (!cfg.token || token !== cfg.token) return res.status(404).json({ error: "This form link is invalid or has been reset." });
  if (!cfg.enabled) return res.status(403).json({ error: "This form isn't accepting responses right now." });
  if (cfg.requireLogin && !req.user) return res.status(401).json({ error: "Please sign in to fill this form." });
  next();
}
const opsOnly = (req: any, res: any, next: any) => (req.user?.role === Role.OPS_ADMIN ? next() : res.status(403).json({ error: "Forbidden" }));
const staffOnly = (req: any, res: any, next: any) => ([Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER].includes(req.user?.role) ? next() : res.status(403).json({ error: "Forbidden" }));

// ── Public ──────────────────────────────────────────────────────────
// Link validity + open/login state + the FORM SCHEMA (so the public page can render itself).
router.get("/config", async (req, res) => {
  const { getCertForm, getBranding, getCertSchema } = await import("../lib/settings");
  const cfg = await getCertForm();
  const valid = !!cfg.token && String(req.query.token || "") === cfg.token;
  res.json({ valid, enabled: cfg.enabled, requireLogin: cfg.requireLogin, branding: await getBranding(), schema: valid ? await getCertSchema() : null });
});

// Employee-ID picker: search the Darwinbox directory (name / id / email).
router.get("/employee-search", formGate, async (req, res) => {
  const { searchDarwinbox } = await import("../lib/staffRoles");
  const items = await searchDarwinbox(clean(req.query.q), 20);
  res.json({ items: items.map((p) => ({ employeeId: p.employeeId, name: p.name, email: p.email, department: p.department })) });
});

// Legacy fixed keys that also live as their own Instructor/Certification columns → keep populating them
// (from the schema answers) so the profile display + queries keep working across old and new schemas.
const LEGACY_KEYS = new Set(["employeeId", "fullName", "email", "department", "capabilityManagerName", "degreeType", "highestQualification", "domain", "yearOfPassing", "odHave", "odExpected", "odLink", "cmmHave", "cmmExpected", "cmmLink", "pcHave", "pcExpected", "pcLink", "remarks"]);

// Submit a response — schema-driven. Text answers come in the body by field key; FILE fields arrive as
// uploads (field name = the field key). Files go to Drive; only the links are stored. Everything lands
// in Certification.answers (+ mirrored to the legacy columns for known keys).
router.post("/submit", formGate, uploadAny, async (req, res) => {
  const { getCertSchema } = await import("../lib/settings");
  const schema = await getCertSchema();
  const b = req.body || {};
  const files = (req.files || []) as any[];
  const fileByKey = new Map<string, any>();
  for (const f of files) if (f?.fieldname && !fileByKey.has(f.fieldname)) fileByKey.set(f.fieldname, f);

  const answers: Record<string, string> = {};
  let warning: string | undefined;
  for (const field of schema.fields) {
    if (field.type === "FILE") {
      const f = fileByKey.get(field.key);
      if (!f) continue;
      try {
        const { link } = await uploadCertificate(f.buffer, f.originalname || field.key, f.mimetype || "application/octet-stream");
        answers[field.key] = link;
      } catch (e: any) {
        // Never lose the response — save the text; surface the upload failure once.
        warning = `Your details were saved, but a file upload failed: ${e?.message || "Drive error"}.`;
      }
    } else {
      const v = clean(b[field.key]);
      if (v) answers[field.key] = v;
    }
  }

  const legacy: Record<string, any> = {};
  for (const [k, v] of Object.entries(answers)) if (LEGACY_KEYS.has(k)) legacy[k] = v;

  const doc = await Certification.create({
    employeeId: answers.employeeId || "NA",
    ...legacy,
    answers,
  });
  res.json({ ok: true, id: String(doc._id), warning });
});

// ── Admin (Ops) ─────────────────────────────────────────────────────
router.get("/settings", requireUser(), opsOnly, async (_req, res) => {
  const { ensureCertToken, getCertSchema } = await import("../lib/settings");
  const certForm = await ensureCertToken(); // create the link token on first visit
  res.json({ certForm, schema: await getCertSchema(), driveReady: driveConfigured(), count: await Certification.countDocuments() });
});
router.patch("/settings", requireUser(), opsOnly, async (req, res) => {
  const { setCertForm } = await import("../lib/settings");
  res.json({ certForm: await setCertForm(req.body || {}) });
});
// Save the form schema (Ops) — sections + fields.
router.get("/schema", requireUser(), opsOnly, async (_req, res) => {
  const { getCertSchema } = await import("../lib/settings");
  res.json({ schema: await getCertSchema() });
});
router.post("/schema", requireUser(), opsOnly, async (req, res) => {
  const { setCertSchema } = await import("../lib/settings");
  res.json({ ok: true, schema: await setCertSchema(req.body?.schema ?? req.body) });
});
// Mint a new link token (Ops) — old link stops working immediately.
router.post("/regenerate", requireUser(), opsOnly, async (_req, res) => {
  const { regenerateCertToken } = await import("../lib/settings");
  res.json({ certForm: await regenerateCertToken() });
});

// All submissions (Ops) — returns the schema (for the columns) + rows (with a flat answers map).
router.get("/", requireUser(), opsOnly, async (_req, res) => {
  const { getCertSchema } = await import("../lib/settings");
  const rows = await Certification.find().sort({ createdAt: -1 }).limit(5000).lean();
  res.json({ schema: await getCertSchema(), items: rows.map(serialize) });
});

// Submissions for one employee (any staff) — for the profile Documents section. Each item carries a
// `files` list (label + Drive url) for the schema's FILE fields, so the profile shows them as links.
router.get("/for-employee/:employeeId", requireUser(), staffOnly, async (req, res) => {
  const { getCertSchema } = await import("../lib/settings");
  const fileFields = (await getCertSchema()).fields.filter((f) => f.type === "FILE");
  const rows = await Certification.find({ employeeId: clean(req.params.employeeId) }).sort({ createdAt: -1 }).lean();
  const items = rows.map((c) => {
    const s = serialize(c);
    const files = fileFields.map((f) => ({ label: f.label, url: s.answers[f.key] })).filter((x) => x.url);
    return { ...s, files };
  });
  res.json({ items });
});

// Flatten a Certification doc into { id, employeeId, createdAt, answers }. Merges the legacy fixed
// columns (older submissions) UNDER the schema answers map (newer submissions), so both render the same.
function serialize(c: any) {
  const legacy: Record<string, string> = {};
  for (const k of LEGACY_KEYS) { const v = c[k]; if (v) legacy[k] = String(v); }
  const answers = { ...legacy, ...(c.answers || {}) };
  return { id: String(c._id), employeeId: c.employeeId || answers.employeeId || "", createdAt: c.createdAt, answers };
}

export default router;
