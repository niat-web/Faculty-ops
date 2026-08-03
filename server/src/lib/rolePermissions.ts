import { Role } from "../enums";

/** Configurable action keys — defaults mirror current hard-coded RBAC (all ON where a role had access). */
export const PERM_KEYS = [
  "edit",
  "delete",
  "manageUsers",
  "manageSettings",
  "manageCertifications",
  "viewAudit",
  "viewData",
  "manageSchema",
  "manageMapping",
  "approveRequests",
] as const;
export type PermKey = (typeof PERM_KEYS)[number];

export const CONFIGURABLE_ROLES = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER] as const;

export const PERM_META: { key: PermKey; label: string; desc: string }[] = [
  { key: "edit", label: "Edit instructor data", desc: "Change instructor fields (scoped by role: org-wide or reportees)." },
  { key: "delete", label: "Delete / remove instructors", desc: "Permanently delete or hide instructors from the app." },
  { key: "manageUsers", label: "Manage staff users", desc: "Access the Users page and manage staff accounts." },
  { key: "manageSettings", label: "System settings", desc: "Access Settings (fields, emails, operations, etc.)." },
  { key: "manageCertifications", label: "Certifications admin", desc: "Manage certification submissions and form config." },
  { key: "viewAudit", label: "Audit log", desc: "View the system audit log." },
  { key: "viewData", label: "Data browser", desc: "Access the raw Data page (BigQuery / Darwinbox)." },
  { key: "manageSchema", label: "Dynamic fields & columns", desc: "Add or hide master / training columns." },
  { key: "manageMapping", label: "Org mapping", desc: "Manage capability manager assignments and org structure." },
  { key: "approveRequests", label: "Approve edit requests", desc: "Approve or reject field-change requests." },
];

/** Baseline permissions — matches pre–Super Admin behaviour when nothing is toggled off. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<PermKey, boolean>> = {
  [Role.OPS_ADMIN]: {
    edit: true, delete: true, manageUsers: true, manageSettings: true, manageCertifications: true,
    viewAudit: true, viewData: true, manageSchema: true, manageMapping: true, approveRequests: false,
  },
  [Role.SENIOR_MANAGER]: {
    edit: true, delete: false, manageUsers: false, manageSettings: false, manageCertifications: false,
    viewAudit: true, viewData: false, manageSchema: true, manageMapping: true, approveRequests: true,
  },
  [Role.CAPABILITY_MANAGER]: {
    edit: true, delete: false, manageUsers: false, manageSettings: false, manageCertifications: false,
    viewAudit: false, viewData: false, manageSchema: false, manageMapping: false, approveRequests: false,
  },
};

let overrides: Record<string, Partial<Record<PermKey, boolean>>> = {};

export function syncRolePermissionCache(raw: Record<string, any> | null | undefined) {
  overrides = (raw && typeof raw === "object") ? raw : {};
}

export function roleHasPermission(role: string, perm: PermKey): boolean {
  if (role === Role.SUPER_ADMIN) return true;
  const base = DEFAULT_ROLE_PERMISSIONS[role]?.[perm];
  if (base === undefined) return false;
  const o = overrides[role]?.[perm];
  if (o === false) return false;
  if (o === true) return true;
  return base;
}

export function permissionsForRole(role: string): Record<PermKey, boolean> {
  return Object.fromEntries(PERM_KEYS.map((k) => [k, roleHasPermission(role, k)])) as Record<PermKey, boolean>;
}

export function mergedRolePermissions(): Record<string, Record<PermKey, boolean>> {
  const out: Record<string, Record<PermKey, boolean>> = {};
  for (const r of CONFIGURABLE_ROLES) out[r] = permissionsForRole(r);
  return out;
}
