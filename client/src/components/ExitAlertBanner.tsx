import { useState } from "react";
import { UserMinus, ArrowRight, Mail, Phone, Briefcase, CalendarClock, CheckCircle2 } from "lucide-react";
import { useCachedGet } from "../hooks";
import { useAuth } from "../auth";
import { api } from "../api";
import { useToast } from "../toast";
import Modal from "./Modal";
import ScrollSelect from "./ScrollSelect";

// Darwinbox-driven exit alerts. Shown as a single-row dashboard banner for Ops Admin,
// Senior Manager and Capability Manager. The Capability Manager the instructor reports to
// can finalise the outcome (3 scenarios); Ops/SM see the same details read-only.

const SCENARIOS = [
  { key: "UNIVERSITY_PAYROLL", label: "Moved to NxtWave University Payroll", desc: "Not an exit — the employee moved to the NxtWave University payroll." },
  { key: "EXITED", label: "Actually exited the organization", desc: "The employee has genuinely left the organization." },
  { key: "CONSULTANT_REHIRE", label: "Exited as Consultant, rejoined as Full-Time", desc: "Exited as a consultant and later rejoined as a full-time employee." },
] as const;

function daysChip(d: number | null) {
  if (d == null) return null;
  const tone = d <= 0 ? "bg-rose-100 text-rose-700" : d <= 2 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
  const txt = d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? "today" : `in ${d}d`;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}><CalendarClock className="h-3 w-3" /> {txt}</span>;
}

export default function ExitAlertBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, reload } = useCachedGet<any>("/exit-alerts");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [uni, setUni] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const items: any[] = data?.items || [];
  if (!items.length) return null;
  const isCM = user?.role === "CAPABILITY_MANAGER";
  const universities: string[] = data?.universities || [];
  const n = items.length;

  async function resolve(a: any) {
    const resolution = sel[a.id];
    if (!resolution) { toast.error("Choose an exit outcome first."); return; }
    if (resolution === "UNIVERSITY_PAYROLL" && !uni[a.id]) { toast.error("Select the university name."); return; }
    setBusy(a.id);
    try {
      await api.post(`/exit-alerts/${a.id}/resolve`, { resolution, university: uni[a.id] || "" });
      toast.success(`Exit finalised for ${a.name}.`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-rose-50 px-5 py-3.5 text-left text-sm text-rose-800 ring-1 ring-rose-200 transition hover:bg-rose-100"
      >
        <span className="flex items-center gap-2">
          <UserMinus className="h-4 w-4" />
          <b>{n}</b> upcoming instructor exit{n > 1 ? "s" : ""} {isCM ? "need your confirmation" : "detected from Darwinbox"}.
        </span>
        <span className="inline-flex items-center gap-1 font-medium">{isCM ? "Review & confirm" : "Check"} <ArrowRight className="h-4 w-4" /></span>
      </button>

      {open && (
        <Modal title={`Exit alerts (${n})`} onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            {items.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{a.name}</div>
                    <div className="font-mono text-[11px] text-slate-400">{a.employeeId}{a.department ? ` · ${a.department}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Last working day <b className="text-slate-800">{a.exitDate}</b></span>
                    {daysChip(a.daysUntil)}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <Field icon={Mail} label="Mail ID" value={a.email} />
                  <Field icon={Briefcase} label="Role" value={a.role} />
                  <Field icon={Phone} label="Mobile" value={a.mobile} />
                </div>

                {a.status === "RESOLVED" ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {a.resolutionLabel}{a.resolvedByName ? ` · ${a.resolvedByName}` : ""}
                  </div>
                ) : isCM ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="mb-2 text-xs font-medium text-slate-500">Confirm the outcome:</div>
                    <div className="space-y-2">
                      {SCENARIOS.map((s) => (
                        <label key={s.key} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${sel[a.id] === s.key ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                          <input type="radio" name={`res-${a.id}`} className="mt-0.5" checked={sel[a.id] === s.key} onChange={() => setSel((m) => ({ ...m, [a.id]: s.key }))} />
                          <span><span className="text-sm font-medium text-slate-800">{s.label}</span><span className="block text-xs text-slate-500">{s.desc}</span></span>
                        </label>
                      ))}
                    </div>
                    {/* University name — only when "Moved to University Payroll" is chosen. */}
                    {sel[a.id] === "UNIVERSITY_PAYROLL" && (
                      <div className="mt-3">
                        <div className="mb-1 text-xs font-medium text-slate-500">University name</div>
                        {universities.length ? (
                          <ScrollSelect value={uni[a.id] || ""} onChange={(v) => setUni((m) => ({ ...m, [a.id]: v }))} options={universities.map((x) => ({ value: x, label: x }))} placeholder="Select university…" />
                        ) : (
                          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">No universities configured yet — add them in Settings → Exit Alerts.</div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button disabled={busy === a.id} onClick={() => resolve(a)} className="btn btn-primary btn-sm disabled:opacity-50">{busy === a.id ? "Saving…" : "Confirm outcome"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-400">Awaiting confirmation from {a.managerName || "the reporting manager"}.</div>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-0.5 truncate text-slate-800">{value || "—"}</div>
    </div>
  );
}
