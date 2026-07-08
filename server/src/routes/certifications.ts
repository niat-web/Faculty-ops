import { Router } from "express";
import multer from "multer";
import { Certification } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { uploadCertificate, driveConfigured } from "../lib/drive";

// Public "Certificates" form + admin management.
//  - /config, /employee-search, /submit are PUBLIC (gated by the admin's enabled/requireLogin toggle).
//  - the rest require an Ops Admin (list, settings) or any staff (for the profile display).

const router = Router();
// Images only — reject PDF, DOCX and everything else.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (String(file.mimetype || "").startsWith("image/") ? cb(null, true) : cb(new Error("Only image files are allowed (no PDF, DOCX or other formats)."))),
});
function uploadImages(req: any, res: any, next: any) {
  upload.fields([{ name: "od", maxCount: 1 }, { name: "cmm", maxCount: 1 }, { name: "pc", maxCount: 1 }])(req, res, (err: any) => (err ? res.status(400).json({ error: err.message || "Upload failed." }) : next()));
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
// Validity of the link + whether the form is open / needs login (so the public page renders correctly).
router.get("/config", async (req, res) => {
  const { getCertForm, getBranding } = await import("../lib/settings");
  const cfg = await getCertForm();
  const valid = !!cfg.token && String(req.query.token || "") === cfg.token;
  res.json({ valid, enabled: cfg.enabled, requireLogin: cfg.requireLogin, branding: await getBranding() });
});

// Employee-ID picker: search the Darwinbox directory (name / id / email).
router.get("/employee-search", formGate, async (req, res) => {
  const { searchDarwinbox } = await import("../lib/staffRoles");
  const items = await searchDarwinbox(clean(req.query.q), 20);
  res.json({ items: items.map((p) => ({ employeeId: p.employeeId, name: p.name, email: p.email, department: p.department })) });
});

// Submit a response. Files (od/cmm/pc) are uploaded to Drive; only the links are stored.
router.post("/submit", formGate, uploadImages, async (req, res) => {
  const b = req.body || {};
  const files = (req.files || {}) as Record<string, any[]>;
  const upload1 = async (f: any): Promise<string> => {
    if (!f) return "";
    const { link } = await uploadCertificate(f.buffer, f.originalname || "certificate", f.mimetype || "application/octet-stream");
    return link;
  };

  let warning: string | undefined;
  let odLink = "", cmmLink = "", pcLink = "";
  try {
    [odLink, cmmLink, pcLink] = await Promise.all([upload1(files.od?.[0]), upload1(files.cmm?.[0]), upload1(files.pc?.[0])]);
  } catch (e: any) {
    // Never lose the response — save the text even if Drive is misconfigured; surface the reason.
    warning = `Your details were saved, but the file upload failed: ${e?.message || "Drive error"}.`;
  }

  const doc = await Certification.create({
    employeeId: clean(b.employeeId) || "NA",
    fullName: clean(b.fullName), email: clean(b.email), department: clean(b.department),
    capabilityManagerName: clean(b.capabilityManagerName),
    degreeType: clean(b.degreeType), highestQualification: clean(b.highestQualification),
    domain: clean(b.domain), yearOfPassing: clean(b.yearOfPassing),
    odHave: clean(b.odHave), odExpected: clean(b.odExpected),
    cmmHave: clean(b.cmmHave), cmmExpected: clean(b.cmmExpected),
    pcHave: clean(b.pcHave), pcExpected: clean(b.pcExpected),
    remarks: clean(b.remarks),
    odLink, cmmLink, pcLink,
  });
  res.json({ ok: true, id: String(doc._id), warning });
});

// ── Admin (Ops) ─────────────────────────────────────────────────────
router.get("/settings", requireUser(), opsOnly, async (_req, res) => {
  const { ensureCertToken } = await import("../lib/settings");
  const certForm = await ensureCertToken(); // create the link token on first visit
  res.json({ certForm, driveReady: driveConfigured(), count: await Certification.countDocuments() });
});
router.patch("/settings", requireUser(), opsOnly, async (req, res) => {
  const { setCertForm } = await import("../lib/settings");
  res.json({ certForm: await setCertForm(req.body || {}) });
});
// Mint a new link token (Ops) — old link stops working immediately.
router.post("/regenerate", requireUser(), opsOnly, async (_req, res) => {
  const { regenerateCertToken } = await import("../lib/settings");
  res.json({ certForm: await regenerateCertToken() });
});

// All submissions (Ops) — the table in the Certifications settings tab.
router.get("/", requireUser(), opsOnly, async (_req, res) => {
  const rows = await Certification.find().sort({ createdAt: -1 }).limit(5000).lean();
  res.json({ items: rows.map(serialize) });
});

// Submissions for one employee (any staff) — for the profile Documents section.
router.get("/for-employee/:employeeId", requireUser(), staffOnly, async (req, res) => {
  const rows = await Certification.find({ employeeId: clean(req.params.employeeId) }).sort({ createdAt: -1 }).lean();
  res.json({ items: rows.map(serialize) });
});

function serialize(c: any) {
  return {
    id: String(c._id), employeeId: c.employeeId, fullName: c.fullName || "", email: c.email || "",
    department: c.department || "", capabilityManagerName: c.capabilityManagerName || "",
    degreeType: c.degreeType || "", highestQualification: c.highestQualification || "", domain: c.domain || "", yearOfPassing: c.yearOfPassing || "",
    odHave: c.odHave || "", odExpected: c.odExpected || "", cmmHave: c.cmmHave || "", cmmExpected: c.cmmExpected || "", pcHave: c.pcHave || "", pcExpected: c.pcExpected || "",
    remarks: c.remarks || "", odLink: c.odLink || "", cmmLink: c.cmmLink || "", pcLink: c.pcLink || "", createdAt: c.createdAt,
  };
}

export default router;
