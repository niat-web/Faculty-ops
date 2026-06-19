import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Notification } from "@/models/index.js";
import {
  canApproveRequests, canSubmitRequests, canManageSchema,
  canManageMapping, canManageUsers, canViewAudit,
} from "@/lib/rbac.js";
import AppShell from "@/components/AppShell.js";

export default async function AppLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await connectDB();
  const unread = await Notification.countDocuments({ userId: user.id, read: false });

  const nav = [{ href: "/app", label: "Dashboard", icon: "dashboard" }];
  nav.push({ href: "/app/instructors", label: "Instructors", icon: "instructors" });
  if (canApproveRequests(user) || canSubmitRequests(user))
    nav.push({ href: "/app/requests", label: "Requests", icon: "requests" });
  if (canManageSchema(user)) nav.push({ href: "/app/fields", label: "Dynamic Fields", icon: "fields" });
  if (canManageMapping(user)) nav.push({ href: "/app/mapping", label: "Assigns", icon: "mapping" });
  if (canViewAudit(user)) nav.push({ href: "/app/org", label: "Org Chart", icon: "org" });
  if (canManageUsers(user)) nav.push({ href: "/app/import", label: "Bulk Import", icon: "import" });
  if (canManageUsers(user)) nav.push({ href: "/app/users", label: "Users", icon: "users" });
  if (canViewAudit(user)) nav.push({ href: "/app/audit", label: "Audit Log", icon: "audit" });

  return (
    <AppShell user={user} nav={nav} unread={unread}>
      {children}
    </AppShell>
  );
}
