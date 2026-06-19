import Link from "next/link";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { ROLE_LABEL } from "@/lib/enums.js";
import PageHeader from "@/components/PageHeader.js";
import SettingsForm from "@/components/SettingsForm.js";
import TwoFactorSetup from "@/components/TwoFactorSetup.js";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  await connectDB();
  const full = await User.findById(user.id).select("emailNotifications managerId twoFactorEnabled").lean();
  let managerName = null;
  if (full?.managerId) {
    const m = await User.findById(full.managerId).select("name").lean();
    managerName = m?.name || null;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Manage your account preferences." />

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Account overview</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={ROLE_LABEL[user.role]} />
          {managerName && <Row label="Reports to" value={managerName} />}
        </dl>
        <Link href="/app/profile" className="btn btn-ghost btn-sm mt-4">Edit profile &amp; password</Link>
      </div>

      <SettingsForm emailNotifications={full?.emailNotifications !== false} />
      <TwoFactorSetup enabled={Boolean(full?.twoFactorEnabled)} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
