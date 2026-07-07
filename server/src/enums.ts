// Single source of truth for enum-like values (ported 1:1 from the Next app).

export const Role = {
  OPS_ADMIN: "OPS_ADMIN",
  SENIOR_MANAGER: "SENIOR_MANAGER",
  CAPABILITY_MANAGER: "CAPABILITY_MANAGER",
  INSTRUCTOR: "INSTRUCTOR",
} as const;
export type RoleType = (typeof Role)[keyof typeof Role];

export const ROLE_LABEL: Record<string, string> = {
  OPS_ADMIN: "Ops Admin",
  SENIOR_MANAGER: "Senior Manager",
  CAPABILITY_MANAGER: "Capability Manager",
  INSTRUCTOR: "Instructor",
};

export const Module = {
  PERSONAL: "PERSONAL", HIRING: "HIRING", TRAINING: "TRAINING",
  DEPLOYMENT: "DEPLOYMENT", PERFORMANCE: "PERFORMANCE", LIFECYCLE: "LIFECYCLE", EXIT: "EXIT",
} as const;
export const MODULE_LABEL: Record<string, string> = {
  PERSONAL: "Personal Details", HIRING: "Hiring Details", TRAINING: "Training Stats",
  DEPLOYMENT: "Deployment", PERFORMANCE: "Performance", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding",
};
export const MODULE_ORDER = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE", "LIFECYCLE", "EXIT"];

export const Visibility = { PUBLIC: "PUBLIC", NECESSARY: "NECESSARY", SENSITIVE: "SENSITIVE" } as const;
export const FieldType = { TEXT: "TEXT", NUMBER: "NUMBER", DATE: "DATE", DROPDOWN: "DROPDOWN", FILE: "FILE", BOOLEAN: "BOOLEAN" } as const;
export const FieldScope = { GLOBAL: "GLOBAL", INSTANCE: "INSTANCE" } as const;

export const LifecycleStatus = {
  ONBOARDING: "ONBOARDING", IN_TRAINING: "IN_TRAINING", CONFIRMED: "CONFIRMED",
  TRANSFER: "TRANSFER", EXIT_IN_PROGRESS: "EXIT_IN_PROGRESS", EXITED: "EXITED", REHIRED: "REHIRED",
} as const;
export const LIFECYCLE_LABEL: Record<string, string> = {
  ONBOARDING: "Onboarding", IN_TRAINING: "In Training", CONFIRMED: "Confirmed",
  TRANSFER: "Transfer", EXIT_IN_PROGRESS: "Exit in Progress", EXITED: "Exited", REHIRED: "Rehired",
};
export const LIFECYCLE_ORDER = ["ONBOARDING", "IN_TRAINING", "CONFIRMED", "TRANSFER", "EXIT_IN_PROGRESS", "EXITED", "REHIRED"];

export const RequestStatus = { PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" } as const;

export const AuditAction = {
  FIELD_EDIT: "FIELD_EDIT", FIELD_ADD: "FIELD_ADD", FIELD_ARCHIVE: "FIELD_ARCHIVE",
  MAPPING_CHANGE: "MAPPING_CHANGE", LIFECYCLE_CHANGE: "LIFECYCLE_CHANGE", NOTE_ADD: "NOTE_ADD",
  REQUEST_DECISION: "REQUEST_DECISION", REQUEST_DELETE: "REQUEST_DELETE", INSTRUCTOR_CREATE: "INSTRUCTOR_CREATE", INSTRUCTOR_DELETE: "INSTRUCTOR_DELETE",
  USER_CREATE: "USER_CREATE", USER_UPDATE: "USER_UPDATE", USER_DELETE: "USER_DELETE",
} as const;

export const NotificationType = {
  EDIT_REQUEST_SUBMITTED: "EDIT_REQUEST_SUBMITTED", EDIT_REQUEST_APPROVED: "EDIT_REQUEST_APPROVED",
  EDIT_REQUEST_REJECTED: "EDIT_REQUEST_REJECTED", SCHEMA_CHANGED: "SCHEMA_CHANGED",
  REASSIGNED: "REASSIGNED", REMINDER: "REMINDER", EXIT_ALERT: "EXIT_ALERT",
} as const;

const VIS_TIER: Record<string, number> = { PUBLIC: 0, NECESSARY: 1, SENSITIVE: 2 };
const ROLE_VIS_TIER: Record<string, number> = { OPS_ADMIN: 2, SENIOR_MANAGER: 2, CAPABILITY_MANAGER: 1, INSTRUCTOR: 1 };
export function roleCanSeeVisibility(role: string, visibility: string) {
  return (ROLE_VIS_TIER[role] ?? 0) >= (VIS_TIER[visibility] ?? 99);
}
