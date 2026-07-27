import { type ReactNode } from "react";
export function pctColor(pct: number): string {
  if (pct >= 80) return "#16a34a";
  if (pct >= 65) return "#d97706";
  return "#dc2626";
}

export function pctBarColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 65) return "#f59e0b";
  return "#ef4444";
}

export function pctClass(pct: number): string {
  if (pct >= 80) return "pct-high";
  if (pct >= 65) return "pct-mid";
  return "pct-low";
}

type StatusVariant = "pending" | "verified" | "approved" | "rejected" | "partial" | "public" | "necessary" | "sensitive" | "gray";

export default function StatusBadge({ variant, children, className = "" }: { variant: StatusVariant; children: ReactNode; className?: string }) {
  const map: Record<StatusVariant, string> = {
    pending: "chip-pending",
    verified: "chip-verified",
    approved: "chip-approved",
    rejected: "chip-rejected",
    partial: "chip-partial",
    public: "chip-public",
    necessary: "chip-necessary",
    sensitive: "chip-sensitive",
    gray: "chip-gray",
  };
  return <span className={`chip ${map[variant]} ${className}`}>{children}</span>;
}
