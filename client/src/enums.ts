// Client-side display constants (mirrors server/src/enums.ts).
export const MODULE_LABEL: Record<string, string> = {
  PERSONAL: "Personal Details", HIRING: "Hiring Details", TRAINING: "Training Stats",
  DEPLOYMENT: "Deployment", PERFORMANCE: "Performance", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding",
};
export const MODULE_ORDER = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE", "LIFECYCLE", "EXIT"];
