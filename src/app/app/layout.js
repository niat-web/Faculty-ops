import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import {
  canApproveRequests, canSubmitRequests, canManageSchema,
  canManageMapping, canManageUsers, canViewAudit, canEditDirectly,
} from "@/lib/rbac.js";
import AppShell from "@/components/AppShell.js";

export default async function AppLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = [{ href: "/app", label: "Dashboard", icon: "dashboard" }];
  nav.push({ href: "/app/instructors", label: "Instructors", icon: "instructors" });
  // Training stats grid — Ops Admin, Senior Manager and Capability Manager.
  if (canEditDirectly(user) || canSubmitRequests(user))
    nav.push({ href: "/app/training", label: "Instructors Training Stats", icon: "training" });
  if (canApproveRequests(user) || canSubmitRequests(user))
    nav.push({ href: "/app/requests", label: "Requests", icon: "requests" });
  if (canManageSchema(user)) nav.push({ href: "/app/fields", label: "Dynamic Fields", icon: "fields" });
  if (canManageMapping(user)) nav.push({ href: "/app/mapping", label: "Assigns", icon: "mapping" });
  if (canViewAudit(user)) nav.push({ href: "/app/org", label: "Org Chart", icon: "org" });
  if (canManageUsers(user)) nav.push({ href: "/app/import", label: "Bulk Import", icon: "import" });
  if (canManageUsers(user)) nav.push({ href: "/app/users", label: "Users", icon: "users" });
  if (canViewAudit(user)) nav.push({ href: "/app/audit", label: "Audit Log", icon: "audit" });

  return (
    <AppShell user={user} nav={nav}>
      {children}
    </AppShell>
  );
}
