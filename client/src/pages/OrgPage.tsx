import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Users2, UserCog, ArrowRight } from "lucide-react";
import { useCachedGet } from "../hooks";
import Loading from "../components/Loading";

export default function OrgPage() {
  const { data: raw, error: err } = useCachedGet<any>("/org"); // cached for instant revisits
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const seniors: any[] = raw?.seniors || [];
  const unassigned: any[] = raw?.unassignedCMs || [];
  const needle = q.trim().toLowerCase();
  const cmCount = seniors.reduce((n: number, s: any) => n + (s.capabilityManagers?.length || 0), 0) + unassigned.length;

  // Filter the left list: keep a Senior Manager if its name matches OR any of its CMs match.
  const filtered = useMemo(() => {
    if (!needle) return seniors;
    return seniors
      .map((s) => {
        const smMatch = s.name.toLowerCase().includes(needle);
        const cms = smMatch ? s.capabilityManagers : (s.capabilityManagers || []).filter((c: any) => c.name.toLowerCase().includes(needle));
        return smMatch || cms.length ? { ...s, capabilityManagers: cms } : null;
      })
      .filter(Boolean) as any[];
  }, [seniors, needle]);

  if (err && !raw) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!raw) return <Loading />;

  const instructorsUnder = (s: any) => (s.capabilityManagers || []).reduce((n: number, c: any) => n + (c.reportees || 0), 0);
  // Active selection. Only auto-pick the first SM when nothing is chosen yet — don't silently
  // swap to a different manager when the chosen one is filtered out by search. (Medium bug)
  const selected = selectedId == null ? (filtered[0] || null) : (filtered.find((s) => s.id === selectedId) || null);
  const selectedCms: any[] = selected?.capabilityManagers || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Org Chart</h1>
        <p className="text-sm text-slate-500">Organization → Senior Managers → Capability Managers. Pick a Senior Manager on the left to view their team.</p>
      </div>

      {/* Level 0 — Organization root */}
      <div className="card overflow-hidden bg-gradient-to-r from-brand-600 to-brand-500 p-5 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20"><Building2 className="h-6 w-6" /></span>
          <div className="flex-1">
            <div className="text-lg font-bold">NIAT — FacultyOps</div>
            <div className="text-sm text-white/80">Instructor organization</div>
          </div>
          <div className="flex gap-6 text-center">
            <Stat label="Instructors" value={raw.totalInstructors || 0} />
            <Stat label="Senior Mgrs" value={seniors.length} />
            <Stat label="Capability Mgrs" value={cmCount} />
          </div>
        </div>
      </div>

      {/* Two-column master/detail: 30% Senior Managers · 70% their Capability Managers */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* LEFT (30%) — Senior Manager cards */}
        <div className="lg:w-[30%]">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manager…" className="input w-full pl-9" />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && <div className="card p-4 text-center text-sm text-slate-400">No managers match "{q}".</div>}
            {filtered.map((sm) => {
              const active = selected?.id === sm.id;
              return (
                <button
                  key={sm.id}
                  onClick={() => setSelectedId(sm.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${active ? "border-brand-300 bg-brand-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${active ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700"}`}>{sm.name.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800">{sm.name}</div>
                    <div className="text-xs text-slate-400">{sm.capabilityManagers?.length || 0} CM · {instructorsUnder(sm)} instructors</div>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 ${active ? "text-brand-600" : "text-slate-300"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT (70%) — Capability Managers of the selected Senior Manager */}
        <div className="lg:w-[70%]">
          {selected ? (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-700">{selected.name.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold text-slate-800">{selected.name}</div>
                  <div className="text-xs text-slate-400">Senior Manager</div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><UserCog className="h-3.5 w-3.5" /> {selectedCms.length} CM</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><Users2 className="h-3.5 w-3.5" /> {instructorsUnder(selected)} instructors</span>
              </div>

              <div className="p-4">
                {selectedCms.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedCms.map((cm: any) => (
                      <button
                        key={cm.id}
                        onClick={() => navigate(`/app/instructors?managerId=${cm.id}`)}
                        className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-300 hover:shadow-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{cm.name.charAt(0)}</span>
                          <span className="min-w-0 text-left">
                            <span className="block truncate text-sm font-medium text-slate-800">{cm.name}</span>
                            <span className="block text-xs text-slate-400">Capability Manager</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="chip chip-status">{cm.reportees} instructor{cm.reportees === 1 ? "" : "s"}</span>
                          <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-6 text-center text-sm text-slate-400">No capability managers assigned to {selected.name}.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center text-sm text-slate-400">Select a Senior Manager to view their team.</div>
          )}
        </div>
      </div>

      {/* Unassigned Capability Managers */}
      {unassigned.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold text-amber-600">Unassigned Capability Managers</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((c) => (
              <button key={c.id} onClick={() => navigate(`/app/instructors?managerId=${c.id}`)} className="inline-flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-1.5 text-sm font-medium hover:border-amber-300">
                {c.name} <span className="chip chip-status">{c.reportees}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-white/70">{label}</div>
    </div>
  );
}
