import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { canAccessInstructor } from "@/lib/rbac.js";
import { getProfileForViewer } from "@/lib/profile.js";
import { MODULE_ORDER, MODULE_LABEL, LIFECYCLE_LABEL } from "@/lib/enums.js";
import Logo from "@/components/Logo.js";
import PrintButton from "@/components/PrintButton.js";

// Clean, print-optimized "Report Card" (PRD calls the profile a Report Card).
// Respects RBAC: a CM viewing this only sees necessary fields.
export default async function ReportCard({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canAccessInstructor(user, params.id))) notFound();
  const data = await getProfileForViewer(user, params.id);
  if (!data) notFound();
  const { instructor, byModule, skills } = data;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-800 print:p-0">
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
        <Logo subtitle />
        <PrintButton />
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{instructor.name}</h1>
        <p className="text-sm text-slate-500">
          {instructor.employeeId} · {instructor.campus || "—"} · {LIFECYCLE_LABEL[instructor.status] || instructor.status} · Manager: {instructor.managerName}
        </p>
        <p className="mt-1 text-xs text-slate-400">Generated {new Date().toLocaleString()}</p>
      </div>

      {MODULE_ORDER.filter((m) => byModule[m]?.length).map((m) => (
        <section key={m} className="mb-5 break-inside-avoid">
          <h2 className="mb-2 border-b border-slate-100 pb-1 text-sm font-bold uppercase tracking-wide text-brand-700">{MODULE_LABEL[m]}</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            {byModule[m].map((f) => (
              <div key={f.key} className="flex justify-between border-b border-dashed border-slate-100 py-1">
                <dt className="text-sm text-slate-500">{f.label}</dt>
                <dd className="text-sm font-medium">{f.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {skills?.list?.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-2 border-b border-slate-100 pb-1 text-sm font-bold uppercase tracking-wide text-brand-700">
            {skills.track} — Skills ({skills.done}/{skills.list.length})
          </h2>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {skills.list.map((s) => (
              <li key={s.key} className={s.done ? "text-slate-800" : "text-slate-400"}>
                {s.done ? "☑" : "☐"} {s.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
        FacultyOps · NIAT Campus Suite · Confidential
      </p>
    </div>
  );
}
