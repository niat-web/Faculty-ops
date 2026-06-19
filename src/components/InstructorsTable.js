"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { useUI } from "./UIProvider.js";

const STATUS_CHIP = "chip chip-status";

export default function InstructorsTable({ rows, managers, statuses, canManage }) {
  const router = useRouter();
  const ui = useUI();
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)));
  const ids = [...sel];

  async function bulk(action, value, label) {
    const ok = await ui.confirm({ title: "Apply to selected?", message: `${label} for ${ids.length} instructor(s).`, confirmText: "Apply" });
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/instructors/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids, value }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setSel(new Set()); router.refresh(); ui.toast(`Updated ${j.changed ?? ids.length} instructor(s)`); }
    else ui.toast(j.error || "Failed", "error");
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-sm">
        {sel.size === 0 ? (
          <span className="font-medium text-slate-500">{rows.length} on this page</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-brand-700">{sel.size} selected</span>
            {canManage && (
              <>
                <select disabled={busy} className="input w-auto py-1.5 text-xs" defaultValue=""
                  onChange={(e) => { if (e.target.value) { bulk("reassign", e.target.value, "Reassign manager"); e.target.value = ""; } }}>
                  <option value="">Reassign to…</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select disabled={busy} className="input w-auto py-1.5 text-xs" defaultValue=""
                  onChange={(e) => { if (e.target.value) { bulk("status", e.target.value, "Set status"); e.target.value = ""; } }}>
                  <option value="">Set status…</option>
                  {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            )}
            <a href={`/api/instructors/export?ids=${ids.join(",")}`} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export selected</a>
            <button onClick={() => setSel(new Set())} className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Clear</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" /></th>
              <th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Campus</th><th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Training</th><th className="whitespace-nowrap px-5 py-3">Status</th><th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((i) => (
              <tr key={i.id} className={`hover:bg-slate-50 ${sel.has(i.id) ? "bg-brand-50/40" : ""}`}>
                <td className="px-4 py-3"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.name}`} /></td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.employeeId}</td>
                <td className="px-5 py-3 font-medium">{i.name}</td>
                <td className="px-5 py-3">{i.campus || "—"}</td>
                <td className="px-5 py-3 text-slate-600">{i.managerName || "—"}</td>
                <td className="px-5 py-3">
                  {i.trainingPct != null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(i.trainingPct, 100)}%` }} /></div>
                      <span className="text-xs text-slate-500">{i.trainingPct}%</span>
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-5 py-3"><span className={STATUS_CHIP}>{i.statusLabel}</span></td>
                <td className="whitespace-nowrap px-5 py-3 text-right"><Link href={`/app/instructors/${i.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-brand-600 hover:underline">Open →</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">No instructors match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
