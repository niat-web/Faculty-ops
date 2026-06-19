import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { canManageUsers } from "@/lib/rbac.js";
import ImportWizard from "@/components/ImportWizard.js";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!canManageUsers(user)) redirect("/app");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Bulk Import</h1>
        <p className="text-sm text-slate-500">
          Migrate your existing spreadsheets. Upload a CSV — every row is validated and
          reconciled (new vs. existing) before anything is written. Matching is by Employee ID.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
