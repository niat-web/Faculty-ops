import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { AuditLog } from "@/models/index.js";
import { canAccessInstructor, canEditDirectly, canSubmitRequests, canViewAudit, canManageUsers } from "@/lib/rbac.js";
import { getProfileForViewer } from "@/lib/profile.js";
import ProfileView from "@/components/ProfileView.js";

export default async function ProfilePage({ params }) {
  const user = await getCurrentUser();
  const allowed = await canAccessInstructor(user, params.id);
  if (!allowed) notFound(); // out of scope → 404 (don't leak existence)

  const data = await getProfileForViewer(user, params.id);
  if (!data) notFound();

  await connectDB();
  const audit = canViewAudit(user)
    ? (await AuditLog.find({ instructorId: params.id }).sort({ createdAt: -1 }).limit(50).lean()).map((a) => ({
        id: String(a._id), actorName: a.actorName, actorRole: a.actorRole, action: a.action,
        fieldName: a.fieldName, oldValue: a.oldValue, newValue: a.newValue,
        reason: a.reason, proofPath: a.proofPath, createdAt: a.createdAt,
      }))
    : null;

  const caps = {
    editDirectly: canEditDirectly(user),
    requestEdit: canSubmitRequests(user),
    viewAudit: canViewAudit(user),
    viewSensitive: canViewAudit(user), // SM / Ops see exit checklist + documents
    canDelete: canManageUsers(user), // Ops Admin can delete the instructor
  };

  return <ProfileView profile={data} caps={caps} audit={audit} />;
}
