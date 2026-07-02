import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Download, ChevronRight, UserCog, Users2, Network, GraduationCap } from "lucide-react";
import { api } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";

// Display order + icon/tint per role.
const ROLE_META: { key: string; icon: any; tint: string }[] = [
  { key: "OPS_ADMIN", icon: UserCog, tint: "bg-violet-100 text-violet-700" },
  { key: "SENIOR_MANAGER", icon: Network, tint: "bg-amber-100 text-amber-700" },
  { key: "CAPABILITY_MANAGER", icon: Users2, tint: "bg-sky-100 text-sky-700" },
  { key: "INSTRUCTOR", icon: GraduationCap, tint: "bg-emerald-100 text-emerald-700" },
];

export default function RolesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get(`/instructors/roles${dq ? `?q=${encodeURIComponent(dq)}` : ""}`, { signal: ac.signal })
      .then((r) => { setCounts(r.counts || {}); setTotal(r.total || 0); setMatches(r.matches || []); setErr(null); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message || "Failed to load roles"); });
    return () => ac.abort();
  }, [dq]);

  // Click a role → Instructor Master filtered to that role.
  const openRole = (role: string) => navigate(`/app/instructors/master?role=${role}`);

  function exportCsv() {
    const rows = [["Role", "Count"], ...ROLE_META.map((r) => [ROLE_LABEL[r.key], String(counts[r.key] ?? 0)]), ["Total", String(total)]];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "roles.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Roles</h1>
          <p className="text-sm text-slate-500">People by role — click a role to open it in Instructor Master.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Search a person to see their role…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button onClick={exportCsv} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
        </div>
      </div>

      {err && <div className="card p-4 text-sm text-rose-600">{err}</div>}

      {/* Person-search results: who is under which role */}
      {dq && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{matches.length} match(es) for “{dq}”</div>
          {matches.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No one matches that search.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matches.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{m.employeeId}</td>
                    <td className="px-5 py-3 font-medium">
                      <Link to={m.staffOnly ? `/app/instructors/master?role=${m.role}` : `/app/instructors/${m.id}`} className="text-brand-700 hover:underline">{m.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{m.email || "—"}</td>
                    <td className="px-5 py-3"><span className="chip chip-gray">{ROLE_LABEL[m.role] || m.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Role breakdown — clickable */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
          <span>Role breakdown</span><span>{total} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-5 py-3">Role</th><th className="px-5 py-3">Count</th><th className="px-5 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROLE_META.map((r) => (
              <tr key={r.key} onClick={() => openRole(r.key)} className="cursor-pointer hover:bg-brand-50/60">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2.5 font-medium text-slate-800">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.tint}`}><r.icon className="h-4 w-4" /></span>
                    {ROLE_LABEL[r.key]}
                  </span>
                </td>
                <td className="px-5 py-3 text-lg font-semibold text-slate-700">{counts[r.key] ?? 0}</td>
                <td className="px-5 py-3 text-right">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">View in Master <ChevronRight className="h-4 w-4" /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
