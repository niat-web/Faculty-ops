// Admin-configurable Certificates form SCHEMA. The public form + submissions table are driven entirely
// by this — an Ops Admin edits sections/fields/types/options/order in the builder, no code change needed.

export type CertFieldType =
  | "TEXT" | "TEXTAREA" | "EMAIL" | "NUMBER" | "DATE"
  | "DROPDOWN" | "RADIO" | "CHECKBOX" | "FILE" | "EMPLOYEE";

export const FIELD_TYPES: { value: CertFieldType; label: string; hint: string }[] = [
  { value: "TEXT", label: "Short text", hint: "Single-line input" },
  { value: "TEXTAREA", label: "Long text", hint: "Multi-line box" },
  { value: "EMAIL", label: "Email", hint: "Email input" },
  { value: "NUMBER", label: "Number", hint: "Numeric input" },
  { value: "DATE", label: "Date", hint: "Date picker" },
  { value: "DROPDOWN", label: "Dropdown", hint: "Pick one from a list" },
  { value: "RADIO", label: "Single choice", hint: "Radio buttons" },
  { value: "CHECKBOX", label: "Multi choice", hint: "Tick any that apply" },
  { value: "FILE", label: "File upload", hint: "Upload a file (set allowed types)" },
  { value: "EMPLOYEE", label: "Employee picker", hint: "Search Darwinbox for the person" },
];
const TYPE_SET = new Set(FIELD_TYPES.map((t) => t.value));
const HAS_OPTIONS = new Set<CertFieldType>(["DROPDOWN", "RADIO", "CHECKBOX"]);

export type CertField = {
  id: string;
  key: string;
  label: string;
  type: CertFieldType;
  sectionId: string;
  required?: boolean;
  options?: string[];   // DROPDOWN / RADIO / CHECKBOX
  accept?: string;      // FILE — e.g. "image/*" or "image/*,application/pdf"
  help?: string;
  placeholder?: string;
};
export type CertSection = { id: string; title: string };
export type CertSchema = { sections: CertSection[]; fields: CertField[] };

// Option sets used by the default form.
export const DEGREE_TYPES = [
  "B.Tech", "B.E.", "B.Sc", "BCA", "B.A", "B.Com", "BBA", "B.Ed",
  "M.Tech", "M.E.", "M.Sc", "MCA", "MBA", "M.A", "M.Com", "PGDM", "M.Ed",
  "Integrated M.Tech", "PhD", "Other",
];
export const HAVE = ["Yes — I have it", "No — I have not received it yet"];

// The default schema = the original hard-coded form, so nothing is lost on first use.
export const DEFAULT_CERT_SCHEMA: CertSchema = {
  sections: [
    { id: "your-details", title: "Your Details" },
    { id: "certificates", title: "Certificates" },
  ],
  fields: [
    { id: "employeeId", key: "employeeId", label: "Employee ID", type: "EMPLOYEE", sectionId: "your-details", required: true },
    { id: "fullName", key: "fullName", label: "Full Name", type: "TEXT", sectionId: "your-details", required: true },
    { id: "email", key: "email", label: "Email", type: "EMAIL", sectionId: "your-details" },
    { id: "department", key: "department", label: "Department", type: "TEXT", sectionId: "your-details" },
    { id: "capabilityManagerName", key: "capabilityManagerName", label: "Capability Manager Name", type: "TEXT", sectionId: "your-details" },
    { id: "degreeType", key: "degreeType", label: "Current Highest Degree Type", type: "DROPDOWN", sectionId: "your-details", options: DEGREE_TYPES },
    { id: "highestQualification", key: "highestQualification", label: "Highest Qualification", type: "TEXT", sectionId: "your-details", help: "Fill this if your degree isn't in the list." },
    { id: "domain", key: "domain", label: "Domain / Specialization", type: "TEXT", sectionId: "your-details" },
    { id: "yearOfPassing", key: "yearOfPassing", label: "Year of Passing", type: "TEXT", sectionId: "your-details" },
    { id: "odHave", key: "odHave", label: "Original Degree (OD) — Do you have it?", type: "DROPDOWN", sectionId: "certificates", options: HAVE },
    { id: "odExpected", key: "odExpected", label: "OD — Expected Month & Year (if not)", type: "TEXT", sectionId: "certificates", placeholder: "e.g. Aug 2026 / NA" },
    { id: "odLink", key: "odLink", label: "OD — Upload image", type: "FILE", sectionId: "certificates", accept: "image/*" },
    { id: "cmmHave", key: "cmmHave", label: "Consolidated Marksheet (CMM) — Do you have it?", type: "DROPDOWN", sectionId: "certificates", options: HAVE },
    { id: "cmmExpected", key: "cmmExpected", label: "CMM — Expected Month & Year (if not)", type: "TEXT", sectionId: "certificates", placeholder: "e.g. Aug 2026 / NA" },
    { id: "cmmLink", key: "cmmLink", label: "CMM — Upload image", type: "FILE", sectionId: "certificates", accept: "image/*" },
    { id: "pcHave", key: "pcHave", label: "Provisional Certificate (PC) — Do you have it?", type: "DROPDOWN", sectionId: "certificates", options: HAVE },
    { id: "pcExpected", key: "pcExpected", label: "PC — Expected Month & Year (if not)", type: "TEXT", sectionId: "certificates", placeholder: "e.g. Aug 2026 / NA" },
    { id: "pcLink", key: "pcLink", label: "PC — Upload image", type: "FILE", sectionId: "certificates", accept: "image/*" },
    { id: "remarks", key: "remarks", label: "Remarks / Additional Comments", type: "TEXTAREA", sectionId: "certificates" },
  ],
};

const slug = (s: string) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

// Coerce arbitrary input into a valid schema (defensive — never trust the client blindly). Drops fields
// with no section, de-dupes keys, keeps only known types, ensures options exist for choice fields.
export function normalizeSchema(raw: any): CertSchema {
  const sectionsIn: any[] = Array.isArray(raw?.sections) ? raw.sections : [];
  const sections: CertSection[] = [];
  const seenSec = new Set<string>();
  for (const s of sectionsIn) {
    const id = String(s?.id || slug(s?.title || "")) || `s${sections.length + 1}`;
    if (!id || seenSec.has(id)) continue;
    seenSec.add(id);
    sections.push({ id, title: String(s?.title || "Section").slice(0, 80) || "Section" });
  }
  if (!sections.length) sections.push({ id: "section-1", title: "Section 1" });
  const secIds = new Set(sections.map((s) => s.id));

  const fieldsIn: any[] = Array.isArray(raw?.fields) ? raw.fields : [];
  const fields: CertField[] = [];
  const seenKey = new Set<string>();
  for (const f of fieldsIn) {
    const type: CertFieldType = TYPE_SET.has(f?.type) ? f.type : "TEXT";
    // Preserve an explicitly-provided key VERBATIM (only strip Map-unsafe chars) so stable camelCase
    // keys like employeeId / fullName / odLink survive — they mirror to legacy columns + the profile.
    // Only slug when we have to derive a key from the label.
    let key = String(f?.key || "").trim().replace(/[.$\s]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) key = slug(f?.label || "");
    if (!key) key = `field_${fields.length + 1}`;
    while (seenKey.has(key)) key = `${key}_${fields.length + 1}`;
    seenKey.add(key);
    const sectionId = secIds.has(f?.sectionId) ? f.sectionId : sections[0].id;
    const out: CertField = { id: String(f?.id || key), key, label: String(f?.label || "Field").slice(0, 120) || "Field", type, sectionId };
    if (f?.required) out.required = true;
    if (HAS_OPTIONS.has(type)) out.options = (Array.isArray(f?.options) ? f.options : []).map((o: any) => String(o).trim()).filter(Boolean);
    if (type === "FILE") out.accept = String(f?.accept || "image/*").slice(0, 120) || "image/*";
    if (f?.help) out.help = String(f.help).slice(0, 200);
    if (f?.placeholder) out.placeholder = String(f.placeholder).slice(0, 120);
    fields.push(out);
  }
  return { sections, fields };
}
