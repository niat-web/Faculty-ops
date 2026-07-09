// Shared Certificates-form schema types + the field-type catalogue for the builder. Mirrors
// server/src/lib/certSchema.ts. The public form and the submissions table are driven by this schema.

export type CertFieldType =
  | "TEXT" | "TEXTAREA" | "EMAIL" | "NUMBER" | "DATE"
  | "DROPDOWN" | "RADIO" | "CHECKBOX" | "FILE" | "EMPLOYEE";

export type CertField = {
  id: string;
  key: string;
  label: string;
  type: CertFieldType;
  sectionId: string;
  required?: boolean;
  options?: string[];
  accept?: string;
  help?: string;
  placeholder?: string;
};
export type CertSection = { id: string; title: string };
export type CertSchema = { sections: CertSection[]; fields: CertField[] };

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

export const TYPE_LABEL: Record<CertFieldType, string> = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label])) as any;
export const HAS_OPTIONS = (t: CertFieldType) => t === "DROPDOWN" || t === "RADIO" || t === "CHECKBOX";

// Common file-accept presets offered in the builder.
export const ACCEPT_PRESETS = [
  { value: "image/*", label: "Images only (JPG, PNG…)" },
  { value: "image/*,application/pdf", label: "Images + PDF" },
  { value: "application/pdf", label: "PDF only" },
];

export const fieldKey = (label: string) =>
  String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
