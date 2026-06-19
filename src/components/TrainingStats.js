"use client";

import { useMemo, useState } from "react";
import { Search, Trash2, GraduationCap } from "lucide-react";
import { useUI } from "@/components/UIProvider.js";
import { TRAINING_TABS, STATUS_OPTIONS, statusTone, EDITABLE_VALUE_FIELDS } from "@/lib/training.js";

const ID_W = 116, NAME_W = 200;

const TONE = {
  completed: "bg-emerald-100 text-emerald-800",
  progress: "bg-amber-100 text-amber-800",
  hold: "bg-slate-200 text-slate-700",
  notstarted: "bg-rose-100 text-rose-700",
  other: "bg-slate-100 text-slate-600",
  empty: "bg-white text-slate-300",
};
const SHORT = { completed: "Completed", progress: "In Progress", hold: "On Hold", notstarted: "Not Started", other: "", empty: "—" };

// Read-only context columns + editable summary columns shown around the modules.
const CTX_COLS = [
  { key: "department", label: "Department", edit: false },
  { key: "manager", label: "Capability Manager", edit: false, fromRow: true },
  { key: "primary_track", label: "Primary Track", edit: false },
  { key: "secondary_track", label: "Secondary Track", edit: false },
  { key: "ongoing_track", label: "Ongoing Track", edit: false },
  { key: "ongoing_start", label: "Ongoing Start", edit: false },
  { key: "track_deadline", label: "Deadline", edit: false },
];
const SUMMARY_COLS = [
  { key: "primary_pct", label: "Primary %" },
  { key: "secondary_pct", label: "Secondary %" },
  { key: "health_status", label: "Health" },
  { key: "predicted_completion", label: "Predicted Completion" },
];

export default function TrainingStats({ rows, canDelete, role }) {
  const ui = useUI();
  const [data, setData] = useState(rows);
  const [tabKey, setTabKey] = useState(() => {
    const counts = {}; for (const r of rows) counts[r.tab] = (counts[r.tab] || 0) + 1;
    return (TRAINING_TABS.find((t) => counts[t.key]) || TRAINING_TABS[0]).key;
  });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [edit, setEdit] = useState(null); // { id, kind:'module'|'value', key }

  const tabCounts = useMemo(() => {
    const c = {}; for (const r of data) c[r.tab] = (c[r.tab] || 0) + 1; return c;
  }, [data]);
  const tab = TRAINING_TABS.find((t) => t.key === tabKey);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((r) => r.tab === tabKey &&
      (!needle || r.name.toLowerCase().includes(needle) || (r.employeeId || "").toLowerCase().includes(needle)));
  }, [data, tabKey, q]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = pageSize === 0 ? filtered : filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function switchTab(k) { setTabKey(k); setPage(0); setEdit(null); }

  async function save(row, kind, key, value) {
    const prevVal = kind === "module" ? (row.moduleStatus[key] ?? "") : (row.ctx[key] ?? "");
    if (String(prevVal) === String(value)) { setEdit(null); return; }
    // optimistic
    setData((prev) => prev.map((r) => {
      if (r.id !== row.id) return r;
      if (kind === "module") {
        const ms = { ...r.moduleStatus };
        if (value) ms[key] = value; else delete ms[key];
        return { ...r, moduleStatus: ms };
      }
      return { ...r, ctx: { ...r.ctx, [key]: value } };
    }));
    setEdit(null);
    const res = await fetch("/api/training", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorId: row.id, target: kind, key, value }),
    });
    if (!res.ok) {
      ui.toast("Save failed — reverted", "error");
      setData((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        if (kind === "module") {
          const ms = { ...r.moduleStatus };
          if (prevVal) ms[key] = prevVal; else delete ms[key];
          return { ...r, moduleStatus: ms };
        }
        return { ...r, ctx: { ...r.ctx, [key]: prevVal } };
      }));
    }
  }

  async function removeRow(row) {
    const ok = await ui.confirm({ title: "Delete instructor?", message: `${row.name} (${row.employeeId}) will be permanently removed.`, danger: true });
    if (!ok) return;
    const res = await fetch(`/api/instructors/${row.id}`, { method: "DELETE" });
    if (res.ok) { setData((prev) => prev.filter((r) => r.id !== row.id)); ui.toast("Instructor deleted", "success"); }
    else ui.toast("Delete failed", "error");
  }

  const frozenHead = "sticky top-0 z-30 border-b border-slate-200 bg-slate-50 text-slate-600";
  const head = "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <GraduationCap className="h-5 w-5 text-brand-600" /> Instructors Training Stats
          </h1>
          <p className="text-sm text-slate-400">
            Module-level progress per track. {role === "CAPABILITY_MANAGER" ? "Showing your assigned instructors only." : "Showing all instructors."}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search name or ID…" className="input w-64 pl-9" />
        </div>
      </div>

      {/* Track tabs */}
      <div className="flex flex-wrap gap-2">
        {TRAINING_TABS.filter((t) => tabCounts[t.key]).map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tabKey === t.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {t.label} <span className="opacity-70">({tabCounts[t.key] || 0})</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {[["completed", "Completed"], ["progress", "In Progress"], ["hold", "On Hold"], ["notstarted", "Not Started"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${TONE[k]}`} /> {l}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="card overflow-auto p-0" style={{ maxHeight: "72vh" }}>
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className={frozenHead} style={{ left: 0, width: ID_W, minWidth: ID_W }}>Employee ID</th>
              <th rowSpan={2} className={frozenHead} style={{ left: ID_W, width: NAME_W, minWidth: NAME_W }}>Name</th>
              {CTX_COLS.map((c) => (
                <th key={c.key} rowSpan={2} className={`${head} px-3 py-2 text-left font-semibold`} style={{ minWidth: 140 }}>{c.label}</th>
              ))}
              {tab.groups.map((g) => (
                <th key={g.name} colSpan={g.modules.length} className={`${head} border-l border-slate-200 px-3 py-2 text-center font-semibold`}>{g.name}</th>
              ))}
              {SUMMARY_COLS.map((c) => (
                <th key={c.key} rowSpan={2} className={`${head} border-l border-slate-200 px-3 py-2 text-left font-semibold`} style={{ minWidth: 120 }}>{c.label}</th>
              ))}
              {canDelete && <th rowSpan={2} className={`${head} px-2`} />}
            </tr>
            <tr>
              {tab.groups.flatMap((g) => g.modules).map((m, i) => (
                <th key={m + i} className={`${head} px-2 py-2 text-center font-medium`} style={{ minWidth: 110, maxWidth: 130 }}>
                  <div className="leading-tight">{m}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="group">
                <td className="sticky z-20 border-b border-slate-100 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-600" style={{ left: 0, width: ID_W, minWidth: ID_W }}>{r.employeeId}</td>
                <td className="sticky z-20 border-b border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-800" style={{ left: ID_W, width: NAME_W, minWidth: NAME_W }}>{r.name}</td>
                {CTX_COLS.map((c) => (
                  <td key={c.key} className="border-b border-slate-100 px-3 py-1.5 text-slate-600">
                    {c.fromRow ? r.manager : (r.ctx[c.key] || "—")}
                  </td>
                ))}
                {tab.groups.flatMap((g) => g.modules).map((m) => {
                  const val = r.moduleStatus[m] ?? "";
                  const tone = statusTone(val);
                  const isEditing = edit && edit.id === r.id && edit.kind === "module" && edit.key === m;
                  return (
                    <td key={m} className="border-b border-l border-slate-100 p-0 text-center">
                      {isEditing ? (
                        <select autoFocus defaultValue={val ? (SHORT[tone] || val) : ""}
                          onBlur={() => setEdit(null)}
                          onChange={(e) => save(r, "module", m, e.target.value)}
                          className="w-full bg-white px-1 py-1.5 text-xs outline-none ring-2 ring-brand-400">
                          <option value="">— clear —</option>
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setEdit({ id: r.id, kind: "module", key: m })}
                          className={`block w-full px-2 py-1.5 text-[11px] ${TONE[tone]} hover:opacity-80`}>
                          {SHORT[tone] || val || "—"}
                        </button>
                      )}
                    </td>
                  );
                })}
                {SUMMARY_COLS.map((c) => {
                  const editable = EDITABLE_VALUE_FIELDS.includes(c.key);
                  const val = r.ctx[c.key] || "";
                  const isEditing = edit && edit.id === r.id && edit.kind === "value" && edit.key === c.key;
                  return (
                    <td key={c.key} className="border-b border-l border-slate-100 px-2 py-1 text-slate-700">
                      {editable && isEditing ? (
                        <input autoFocus defaultValue={val}
                          onBlur={(e) => save(r, "value", c.key, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdit(null); }}
                          className="w-24 rounded border border-brand-300 px-1 py-0.5 text-xs outline-none ring-1 ring-brand-200" />
                      ) : (
                        <button disabled={!editable} onClick={() => editable && setEdit({ id: r.id, kind: "value", key: c.key })}
                          className={`block w-full text-left ${editable ? "hover:text-brand-600" : "cursor-default"}`}>
                          {val || "—"}
                        </button>
                      )}
                    </td>
                  );
                })}
                {canDelete && (
                  <td className="border-b border-slate-100 px-2 text-center">
                    <button onClick={() => removeRow(r)} className="text-slate-300 hover:text-rose-600" title="Delete instructor">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={99} className="px-4 py-10 text-center text-sm text-slate-400">No instructors in this track.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <div>
          {filtered.length ? `${pageSize === 0 ? 1 : safePage * pageSize + 1}–${pageSize === 0 ? filtered.length : Math.min((safePage + 1) * pageSize, filtered.length)} of ${filtered.length}` : "0 results"}
        </div>
        <div className="flex items-center gap-3">
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="input w-auto py-1 text-xs">
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={0}>All</option>
          </select>
          {pageSize !== 0 && pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="btn-ghost px-2 py-1 disabled:opacity-40">Prev</button>
              <span className="px-2">{safePage + 1} / {pageCount}</span>
              <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="btn-ghost px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
