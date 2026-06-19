"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, History } from "lucide-react";
import { useUI } from "./UIProvider.js";

export default function MappingManager({ cms, instructors }) {
  const router = useRouter();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const cmName = (id) => cms.find((c) => c.id === id)?.name || "— unassigned —";

  async function reassign(instructorIds, toManagerId) {
    if (!toManagerId) return;
    setBusy(true);
    const res = await fetch("/api/mapping/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorIds, toManagerId }),
    });
    setBusy(false);
    if (res.ok) { router.refresh(); ui.toast("Reportees reassigned"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }

  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");

  return (
    <div className="space-y-5">
      {/* bulk reassign */}
      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Bulk reassign reportees</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">From manager</label>
            <select className="input w-48" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)}>
              <option value="">Choose…</option>
              {cms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <ArrowRight className="mb-2 h-4 w-4 text-slate-300" />
          <div>
            <label className="label">To manager</label>
            <select className="input w-48" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>
              <option value="">Choose…</option>
              {cms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !bulkFrom || !bulkTo || bulkFrom === bulkTo}
            onClick={async () => {
              const ids = instructors.filter((i) => i.managerId === bulkFrom).map((i) => i.id);
              if (!ids.length) return ui.toast("That manager has no reportees.", "error");
              if (await ui.confirm({ title: "Bulk reassign?", message: `Move ${ids.length} reportee(s) to ${cmName(bulkTo)}.`, confirmText: "Move all" })) reassign(ids, bulkTo);
            }}
          >
            Move all reportees
          </button>
        </div>
      </div>

      {/* per-instructor */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">All instructors ({instructors.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Campus</th><th className="px-5 py-3">Current manager</th><th className="px-5 py-3">Reassign to</th><th className="px-5 py-3">History</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instructors.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.employeeId}</td>
                  <td className="px-5 py-3 font-medium">{i.name}</td>
                  <td className="px-5 py-3 text-slate-500">{i.campus || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{cmName(i.managerId)}</td>
                  <td className="px-5 py-3">
                    <select
                      className="input w-44"
                      defaultValue=""
                      disabled={busy}
                      onChange={(e) => { if (e.target.value) reassign([i.id], e.target.value); }}
                    >
                      <option value="">Change…</option>
                      {cms.filter((c) => c.id !== i.managerId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/app/instructors/${i.id}/history`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      <History className="h-3.5 w-3.5" /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
