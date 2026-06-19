import { getCurrentUser } from "@/lib/auth.js";
import { ROLE_LABEL } from "@/lib/enums.js";
import PageHeader from "@/components/PageHeader.js";
import EditProfileForm from "@/components/EditProfileForm.js";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-5">
      <PageHeader title="Edit Profile" subtitle="Update your display name and password." />

      <div className="card flex items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-lg font-bold">{user.name}</div>
          <div className="text-sm text-slate-500">{user.email}</div>
          <span className="chip chip-status mt-1 inline-block">{ROLE_LABEL[user.role]}</span>
        </div>
      </div>

      <EditProfileForm name={user.name} email={user.email} />
    </div>
  );
}
