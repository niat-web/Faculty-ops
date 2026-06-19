// Single source of truth for enum-like values, used by models, RBAC, and UI.

export const Role = {
  OPS_ADMIN: "OPS_ADMIN",
  SENIOR_MANAGER: "SENIOR_MANAGER",
  CAPABILITY_MANAGER: "CAPABILITY_MANAGER",
  INSTRUCTOR: "INSTRUCTOR",
};
export const ROLE_LABEL = {
  OPS_ADMIN: "Ops Admin",
  SENIOR_MANAGER: "Senior Manager",
  CAPABILITY_MANAGER: "Capability Manager",
  INSTRUCTOR: "Instructor",
};

export const Module = {
  PERSONAL: "PERSONAL",
  HIRING: "HIRING",
  TRAINING: "TRAINING",
  DEPLOYMENT: "DEPLOYMENT",
  PERFORMANCE: "PERFORMANCE",
  LIFECYCLE: "LIFECYCLE",
  EXIT: "EXIT",
};
export const MODULE_LABEL = {
  PERSONAL: "Personal Details",
  HIRING: "Hiring Details",
  TRAINING: "Training Stats",
  DEPLOYMENT: "Deployment",
  PERFORMANCE: "Performance",
  LIFECYCLE: "Lifecycle & Status",
  EXIT: "Exit / Offboarding",
};
export const MODULE_ORDER = [
  "PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE", "LIFECYCLE", "EXIT",
];

export const Visibility = { PUBLIC: "PUBLIC", NECESSARY: "NECESSARY", SENSITIVE: "SENSITIVE" };
export const FieldType = {
  TEXT: "TEXT", NUMBER: "NUMBER", DATE: "DATE",
  DROPDOWN: "DROPDOWN", FILE: "FILE", BOOLEAN: "BOOLEAN",
};
export const FieldScope = { GLOBAL: "GLOBAL", INSTANCE: "INSTANCE" };

export const LifecycleStatus = {
  ONBOARDING: "ONBOARDING",
  IN_TRAINING: "IN_TRAINING",
  CONFIRMED: "CONFIRMED",
  TRANSFER: "TRANSFER",
  EXIT_IN_PROGRESS: "EXIT_IN_PROGRESS",
  EXITED: "EXITED",
  REHIRED: "REHIRED",
};
export const LIFECYCLE_LABEL = {
  ONBOARDING: "Onboarding",
  IN_TRAINING: "In Training",
  CONFIRMED: "Confirmed",
  TRANSFER: "Transfer",
  EXIT_IN_PROGRESS: "Exit in Progress",
  EXITED: "Exited",
  REHIRED: "Rehired",
};
export const LIFECYCLE_ORDER = [
  "ONBOARDING", "IN_TRAINING", "CONFIRMED", "TRANSFER", "EXIT_IN_PROGRESS", "EXITED", "REHIRED",
];

export const RequestStatus = { PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" };

export const AuditAction = {
  FIELD_EDIT: "FIELD_EDIT",
  FIELD_ADD: "FIELD_ADD",
  FIELD_ARCHIVE: "FIELD_ARCHIVE",
  MAPPING_CHANGE: "MAPPING_CHANGE",
  LIFECYCLE_CHANGE: "LIFECYCLE_CHANGE",
  NOTE_ADD: "NOTE_ADD",
  REQUEST_DECISION: "REQUEST_DECISION",
  INSTRUCTOR_CREATE: "INSTRUCTOR_CREATE",
  USER_CREATE: "USER_CREATE",
};

export const NotificationType = {
  EDIT_REQUEST_SUBMITTED: "EDIT_REQUEST_SUBMITTED",
  EDIT_REQUEST_APPROVED: "EDIT_REQUEST_APPROVED",
  EDIT_REQUEST_REJECTED: "EDIT_REQUEST_REJECTED",
  SCHEMA_CHANGED: "SCHEMA_CHANGED",
  REASSIGNED: "REASSIGNED",
  REMINDER: "REMINDER",
};

// Visibility tiers — a role sees a field iff role tier >= field tier.
const VIS_TIER = { PUBLIC: 0, NECESSARY: 1, SENSITIVE: 2 };
const ROLE_VIS_TIER = { OPS_ADMIN: 2, SENIOR_MANAGER: 2, CAPABILITY_MANAGER: 1, INSTRUCTOR: 1 };

export function roleCanSeeVisibility(role, visibility) {
  return (ROLE_VIS_TIER[role] ?? 0) >= (VIS_TIER[visibility] ?? 99);
}
